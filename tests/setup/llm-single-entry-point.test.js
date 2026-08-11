/**
 * Conformance guard: chat-completion calls go through shared/services/llm-client.
 *
 * CLAUDE.md states it as an architecture fact — "All LLM calls go through
 * bot/shared/services/llm-client.js (OpenRouter — one API, many models)" — but
 * nothing enforced it, and four services had drifted into constructing their own
 * OpenAI client keyed on OPENAI_API_KEY. On a deployment configured the
 * documented way (OPENROUTER_API_KEY set, OPENAI_API_KEY empty) each of them
 * failed, and each failure surfaced as a broken feature rather than as a
 * configuration error:
 *
 *   quiz-generation.service.js      → "/quiz" could not generate a quiz
 *   pic-to-lp/classifier.service.js → every inbound image failed to classify
 *   pic-to-lp/metadata-extractor    → same pipeline, next stage
 *   coaching/transcript-enhancer    → coaching transcripts un-enhanced
 *   coaching/coaching-helpers       → no post-session encouragement message
 *
 * Legitimately exempt: anything that is not a chat completion. OpenAI-only
 * endpoints (audio transcription) and non-OpenAI SDKs keep their own clients.
 */

const fs = require('fs');
const path = require('path');

const BOT_DIR = path.resolve(__dirname, '../../bot');
const SEARCH_DIRS = ['shared', 'workers'].map((d) => path.join(BOT_DIR, d));

/**
 * Files allowed to build their own OpenAI-shaped client, with the reason.
 * Keep this list SHORT and justified — it is the escape hatch, not the norm.
 */
const ALLOWED = new Map([
  ['shared/services/llm-client.js', 'is the single entry point'],
  ['shared/utils/lazy-client.js', 'generic lazy-construction helper; its OpenAI mention is a doc example'],
  [
    'shared/services/coaching/reflective-questions/llm-router.service.js',
    'builds an OpenRouter client directly from OPENROUTER_API_KEY (right provider, own routing needs)',
  ],
  // Not chat completions: OpenAI-only endpoints that OpenRouter does not proxy.
  ['shared/services/audio.service.js', 'openai.audio.transcriptions (Whisper) — OpenAI-only endpoint'],
  ['shared/services/elevenlabs.service.js', 'openai.audio.speech (TTS fallback) — OpenAI-only endpoint'],
]);

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;
      out.push(...listJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Comments stripped, so a file may describe the wrong pattern in prose. */
function codeOf(file) {
  return fs.readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}

const files = SEARCH_DIRS.flatMap(listJsFiles);

describe('LLM single entry point', () => {
  it('finds files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no service builds its own OpenAI client keyed on OPENAI_API_KEY', () => {
    const violations = [];

    for (const file of files) {
      const rel = path.relative(BOT_DIR, file).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;

      const code = codeOf(file);
      // Both spellings that were found in the wild.
      const direct = /new OpenAI\s*\(/.test(code);
      const lazy = /lazyClient\(\s*OpenAI\s*,\s*\[\s*'OPENAI_API_KEY'/.test(code);
      if (direct || lazy) violations.push(rel);
    }

    expect(violations).toEqual([]);
  });

  it('the services that regressed now import llm-client', () => {
    const repaired = [
      'shared/services/quiz/quiz-generation.service.js',
      'shared/services/quiz/quiz-report.service.js',
      'shared/services/quiz/quiz-session.service.js',
      'shared/services/quiz/video-quiz-report.service.js',
      'shared/services/pic-to-lp/classifier.service.js',
      'shared/services/pic-to-lp/metadata-extractor.service.js',
      'shared/services/coaching/transcript-enhancer.service.js',
      'shared/services/coaching/coaching-helpers.service.js',
    ];
    for (const rel of repaired) {
      const code = codeOf(path.join(BOT_DIR, rel));
      expect(code).toMatch(/require\('\.\.?\/(\.\.\/)?llm-client'\)/);
    }
  });

  it('every allow-listed file still exists (the list cannot rot silently)', () => {
    for (const rel of ALLOWED.keys()) {
      expect(fs.existsSync(path.join(BOT_DIR, rel))).toBe(true);
    }
  });

  it('the audio exemptions really are audio endpoints, not chat completions', () => {
    // Pins WHY they are exempt, so the allow-list can't quietly become a place
    // to hide a chat-completion bypass.
    for (const rel of ['shared/services/audio.service.js', 'shared/services/elevenlabs.service.js']) {
      const code = codeOf(path.join(BOT_DIR, rel));
      expect(code).toMatch(/openai\.audio\.|this\.openai\.audio\./);
      expect(code).not.toMatch(/chat\.completions\.create/);
    }
  });
});
