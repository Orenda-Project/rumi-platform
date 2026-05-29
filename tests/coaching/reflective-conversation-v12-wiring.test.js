/**
 * Reflective-conversation v12 wiring (Wave 3 PR δ).
 *
 * Locks: the live reflective-conversation flow (`reflective-conversation.service.js`,
 * reached via coaching-orchestrator.service.js) reads
 * `analysis_data.reflective_corpus` (from bd-1842) and calls
 * `_generateReflectiveQuestionV12` with the corpus + adapted chain history,
 * NOT the legacy single-shot `generateReflectiveQuestion`.
 *
 * Falls back to `buildSafeFallback` when corpus is absent.
 */

jest.mock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
jest.mock('dotenv', () => ({ config: () => ({}) }), { virtual: true });
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const mockV12 = jest.fn().mockResolvedValue('A clean v12 question.');
const mockLegacy = jest.fn();
jest.mock('../../bot/shared/services/gpt5-mini.service', () => ({
  _generateReflectiveQuestionV12: (...args) => mockV12(...args),
  generateReflectiveQuestion: (...args) => mockLegacy(...args),
}));

describe('Reflective-conversation v12 wiring — source-level guard', () => {
  // We use a source-level grep on the two consumers because the live flow
  // depends on supabase, elevenlabs, whatsapp, audio-cache — too many real
  // deps to unit-test end-to-end. The source-level guard locks the call site
  // shape and the corpus-absent fallback branch.
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');

  // Only the split service remains — the legacy `coaching.service.js`
  // monolith (a second consumer this guard used to cover) was deleted as
  // dead code in Wave 6 (bd-1873). The live reflective path is the split
  // service, reached via coaching-orchestrator.service.js.
  const CONSUMER_FILES = [
    'bot/shared/services/coaching/reflective-conversation.service.js',
  ];

  for (const file of CONSUMER_FILES) {
    describe(file, () => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');

      it('calls GPT5MiniService._generateReflectiveQuestionV12', () => {
        expect(src).toMatch(/GPT5MiniService\._generateReflectiveQuestionV12\(/);
      });

      it('reads corpus from analysis_data.reflective_corpus', () => {
        expect(src).toMatch(/analysis_data\.reflective_corpus|analysis_data && session\.analysis_data\.reflective_corpus/);
      });

      it('falls back to buildSafeFallback when corpus is missing', () => {
        expect(src).toMatch(/require\(['"][^'"]*reflective-questions\/guardrails['"]\)/);
        expect(src).toMatch(/buildSafeFallback/);
      });

      it('does NOT call the legacy generateReflectiveQuestion', () => {
        // The deprecated method exists on GPT5MiniService but no consumer
        // should call it any more.
        expect(src).not.toMatch(/GPT5MiniService\.generateReflectiveQuestion\(/);
      });
    });
  }
});
