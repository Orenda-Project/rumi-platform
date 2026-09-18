/**
 * Grandparent Bridge trigger — the pure keyword detector, plus a route-contract
 * check that the handler actually wires it up.
 *
 * The route-contract test is mock-free on purpose: a unit test of the detector
 * cannot catch a detector nobody calls (pre-merge-checklist Class A), so this
 * greps the receiver's source instead.
 */

const fs = require('fs');
const path = require('path');

const {
  detectGrandparentBridgeIntent,
  HIGH_KEYWORDS,
  MEDIUM_KEYWORDS,
} = require('../../bot/shared/handlers/grandparent-bridge-trigger');

describe('detectGrandparentBridgeIntent', () => {
  it('treats /bridge as an explicit, high-confidence start', () => {
    expect(detectGrandparentBridgeIntent('/bridge')).toEqual({
      detected: true, confidence: 'high', keyword: '/bridge',
    });
  });

  it('detects the keywords a parent actually uses, at medium confidence', () => {
    for (const text of [
      'my in-laws think this is neglect',
      'the relatives keep asking me',
      'her grandparents are not happy about it',
      'meri saas roz kehti hai',
      "my family doesn't support this at all",
    ]) {
      const result = detectGrandparentBridgeIntent(text);
      expect(result.detected).toBe(true);
      expect(result.confidence).toBe('medium');
    }
  });

  it('detects Urdu-script family words', () => {
    expect(detectGrandparentBridgeIntent('ساس کہتی ہیں اسکول بھیجو').confidence).toBe('medium');
    expect(detectGrandparentBridgeIntent('سسرال والے ناراض ہیں').confidence).toBe('medium');
  });

  it('is quiet on unrelated messages', () => {
    for (const text of ['make me a lesson plan for grade 4', '/menu', 'attendance', '', '   ', null, undefined, 42]) {
      expect(detectGrandparentBridgeIntent(text).detected).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(detectGrandparentBridgeIntent('MY IN-LAWS ARE UPSET').detected).toBe(true);
  });

  it('keeps the two tiers distinct — no keyword is in both', () => {
    const high = new Set(HIGH_KEYWORDS.map((k) => k.toLowerCase()));
    for (const k of MEDIUM_KEYWORDS) expect(high.has(k.toLowerCase())).toBe(false);
  });
});

describe('route contract (Class A: an emitted trigger needs a receiver)', () => {
  const handler = fs.readFileSync(
    path.resolve(__dirname, '../../bot/shared/handlers/text-message.handler.js'),
    'utf8'
  );

  it('text-message.handler.js requires the detector and the service', () => {
    expect(handler).toContain("require('./grandparent-bridge-trigger')");
    expect(handler).toContain("require('../services/grandparent-bridge.service')");
  });

  it('intercepts a mid-intake reply and dispatches the completed intake', () => {
    expect(handler).toMatch(/GrandparentBridgeService\.isInIntake/);
    expect(handler).toMatch(/GrandparentBridgeService\.handleReply/);
    expect(handler).toMatch(/GrandparentBridgeService\.deliver/);
    expect(handler).toMatch(/GrandparentBridgeService\.start/);
  });

  it('lets a slash command through instead of eating it as an intake answer', () => {
    const block = handler.slice(handler.indexOf('GRANDPARENT BRIDGE (D3)'), handler.indexOf('const iceBreakers'));
    expect(block).toMatch(/startsWith\('\/'\)/);
  });

  it('emits no interactive button/list IDs (nothing to orphan)', () => {
    const block = handler.slice(handler.indexOf('GRANDPARENT BRIDGE (D3)'), handler.indexOf('const iceBreakers'));
    expect(block).not.toMatch(/sendInteractiveButtons|sendInteractiveMessage|sendFlow/);
  });
});
