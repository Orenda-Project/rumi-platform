'use strict';
/**
 * Grandparent Bridge Service
 *
 * A homeschooling parent answers three quick questions on WhatsApp — why she
 * home-educates, her child's age, and the ONE objection she keeps hearing from
 * a relative — and gets back a short, warm, non-defensive one-pager in Urdu
 * and English that she can forward to that relative.
 *
 * ── Design decisions worth knowing before editing ──────────────────────────
 *
 * 1. NO Meta Flow. The three questions are collected as a chat conversation,
 *    Redis-backed and keyed by user id, exactly like
 *    attendance-conversation.service.js does, and for the same reason
 *    messaging/text-flow-definitions.js exists: a Meta-hosted Flow needs a
 *    registered `*_FLOW_ID`, which a fresh clone does not have, and a feature
 *    gated behind one looks *broken* rather than unavailable on the sandbox
 *    driver. Three questions do not earn a Flow — so this path is the only
 *    path, on every channel, and there is no Flow id to register.
 *
 * 2. The evidence library is data, not prose. bot/shared/data/
 *    grandparent-bridge-evidence.json holds every objection, its warm
 *    reassurance in both languages, and the ONLY claims we are allowed to
 *    make about it — each with a source and the research sweep's own
 *    lean/quality flag. The LLM may reword the note; it may NOT introduce a
 *    fact, and `buildPrompt()` therefore hands it the matched objection's
 *    entries and nothing else (see the test that pins this).
 *
 * 3. There is always a deterministic answer. When no LLM is reachable — or it
 *    returns something unparseable, or over the word budget — the one-pager is
 *    assembled from the library by `fallbackOnePager()`. The feature is core:
 *    it needs no API key to produce text.
 *
 * 4. The PDF is a bonus, not the product. It reuses the same
 *    shared/utils/html-to-pdf.js Playwright engine as the quiz/reading
 *    reports, which needs a Chromium binary rather than an API key — so the
 *    PDF path is gated on `isPdfAvailable()` and, when Chromium is absent,
 *    the parent still gets both languages as text. (Gamma is deliberately NOT
 *    used: it is a slide-deck generator gated on GAMMA_API_KEY, and this is
 *    one page of prose with Nastaliq in it.)
 *
 * 5. Voice register comes from the Rumi Sparks "Delivery Engine": warm, "we",
 *    zero judgment, assume the relative is coming from care. The page opens by
 *    honouring their concern and ends with ONE concrete invitation. It never
 *    argues.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const redisService = require('./cache/railway-redis.service');
const WhatsAppService = require('./whatsapp.service');
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const LIBRARY = require('../data/grandparent-bridge-evidence.json');

// ── Conversation states ──────────────────────────────────────────────────────
const STATES = {
  ASKING_REASON: 'ASKING_REASON',
  ASKING_AGE: 'ASKING_AGE',
  ASKING_OBJECTION: 'ASKING_OBJECTION',
};

/** Long enough to answer three questions between school runs; short enough to expire. */
const SESSION_TTL = 1800; // 30 minutes

/** Hard budget per language — a relative reads one screen, not an essay. */
const WORD_LIMIT = 180;

/** Every conversation must have a way out (same escape hatch as text-flow.js). */
const CANCEL_RE = /^(cancel|stop|exit|quit|nevermind|never mind|منسوخ|بس)$/i;

const QUESTIONS = {
  reason:
    '💛 Let us write something you can forward to them.\n\n'
    + '*1 of 3.* In your own words — why do you teach your child at home?\n\n'
    + '(One line is plenty. Type *cancel* any time.)',
  age: '*2 of 3.* How old is your child?',
  objection:
    '*3 of 3.* Which one thing do you keep hearing from them?\n\n'
    + 'Reply with a number, or just type it in your own words.',
};

class GrandparentBridgeService {
  // ── Library access ────────────────────────────────────────────────────────

  /** Every objection in the curated library, in menu order. */
  static objections() {
    return LIBRARY.objections;
  }

  /** @returns {object|null} the objection entry with this id */
  static getObjection(id) {
    return LIBRARY.objections.find((o) => o.id === id) || null;
  }

  /** True until a fluent Urdu speaker has signed the library off. */
  static isUrduReviewed() {
    return LIBRARY.ur_reviewed === true;
  }

  /**
   * Match free text (or a menu number) to one objection.
   *
   * Order matters: a bare number is the menu index, then id/alias containment,
   * then a single-word overlap pass so "they say she has no friends at all"
   * still lands on `no_friends`.
   *
   * @param {string} text
   * @returns {object|null} the matched objection entry, or null
   */
  static matchObjection(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const list = this.objections();

    // A bare number is the menu index shown in the prompt.
    if (/^\d{1,2}$/.test(raw)) {
      return list[parseInt(raw, 10) - 1] || null;
    }

    const lower = raw.toLowerCase();

    // Longest alias first, so "not a real school" beats "school".
    const candidates = [];
    for (const objection of list) {
      for (const alias of [objection.id.replace(/_/g, ' '), ...objection.aliases]) {
        candidates.push({ objection, alias: String(alias).toLowerCase() });
      }
    }
    candidates.sort((a, b) => b.alias.length - a.alias.length);
    for (const { objection, alias } of candidates) {
      if (lower.includes(alias)) return objection;
    }

    return null;
  }

  /** The numbered menu for question 3 — built from the library, never hardcoded. */
  static objectionMenu() {
    return this.objections()
      .map((o, i) => `${i + 1}. ${o.objection_en}\n    ${o.objection_ur}`)
      .join('\n');
  }

  // ── Intake state machine (Redis-backed, same pattern as attendance) ───────

  static getRedisKey(userId) {
    return `bridge:intake:${userId}`;
  }

  static async getSessionState(userId) {
    if (!userId) return null;
    try {
      const data = await redisService.get(this.getRedisKey(userId));
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: could not read intake state', { userId, error: error.message });
      return null;
    }
  }

  static async saveSessionState(userId, state) {
    try {
      const stored = await redisService.set(this.getRedisKey(userId), JSON.stringify(state), SESSION_TTL);
      // set() returns false (it does not throw) when Redis isn't ready. Say so —
      // otherwise the intake silently dies at the next question.
      if (stored === false) {
        logToFile('⚠️ Grandparent Bridge: Redis unavailable — intake will not survive a restart', { userId });
      }
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: could not save intake state', { userId, error: error.message });
    }
    return state;
  }

  static async clearSessionState(userId) {
    try {
      await redisService.delete(this.getRedisKey(userId));
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: could not clear intake state', { userId, error: error.message });
    }
  }

  static async isInIntake(userId) {
    return Boolean(await this.getSessionState(userId));
  }

  /**
   * Begin the three questions.
   * @returns {Promise<{state:string, message:string}>}
   */
  static async start(userId) {
    await this.saveSessionState(userId, { state: STATES.ASKING_REASON, answers: {}, startedAt: new Date().toISOString() });
    logToFile('💛 Grandparent Bridge intake started', { userId });
    return { state: STATES.ASKING_REASON, message: QUESTIONS.reason };
  }

  /**
   * Feed the parent's reply into the intake.
   *
   * @param {string} userId
   * @param {string} text
   * @returns {Promise<null | {status:'cancelled'|'unmatched'|'step'|'complete', message?:string, state?:string, answers?:object}>}
   *   null when no intake is active (the caller should handle the message
   *   normally — a pending intake does not mean every message answers it).
   */
  static async handleReply(userId, text) {
    const session = await this.getSessionState(userId);
    if (!session) return null;

    const trimmed = String(text || '').trim();

    if (CANCEL_RE.test(trimmed)) {
      await this.clearSessionState(userId);
      logToFile('⏹️ Grandparent Bridge intake cancelled', { userId });
      return { status: 'cancelled', message: 'No problem — stopped. Say */bridge* whenever you want to pick this up again.' };
    }

    if (!trimmed) {
      return { status: 'unmatched', state: session.state, message: this.questionFor(session.state) };
    }

    const answers = { ...session.answers };

    switch (session.state) {
      case STATES.ASKING_REASON: {
        answers.reason = trimmed;
        await this.saveSessionState(userId, { ...session, state: STATES.ASKING_AGE, answers });
        return { status: 'step', state: STATES.ASKING_AGE, message: QUESTIONS.age, answers };
      }

      case STATES.ASKING_AGE: {
        const age = this.parseAge(trimmed);
        if (age === null) {
          return {
            status: 'unmatched',
            state: STATES.ASKING_AGE,
            message: 'Just the age in years is fine — for example *6*.',
          };
        }
        answers.age = age;
        await this.saveSessionState(userId, { ...session, state: STATES.ASKING_OBJECTION, answers });
        return {
          status: 'step',
          state: STATES.ASKING_OBJECTION,
          message: `${QUESTIONS.objection}\n\n${this.objectionMenu()}`,
          answers,
        };
      }

      case STATES.ASKING_OBJECTION: {
        const objection = this.matchObjection(trimmed);
        if (!objection) {
          return {
            status: 'unmatched',
            state: STATES.ASKING_OBJECTION,
            message: `I did not catch which one that is. Reply with a number from the list:\n\n${this.objectionMenu()}`,
          };
        }
        answers.objection = objection.id;
        await this.clearSessionState(userId);
        logToFile('✅ Grandparent Bridge intake complete', { userId, objection: objection.id, age: answers.age });
        return { status: 'complete', answers };
      }

      default:
        // An unknown state can only come from a shape change mid-conversation.
        await this.clearSessionState(userId);
        return null;
    }
  }

  static questionFor(state) {
    if (state === STATES.ASKING_AGE) return QUESTIONS.age;
    if (state === STATES.ASKING_OBJECTION) return `${QUESTIONS.objection}\n\n${this.objectionMenu()}`;
    return QUESTIONS.reason;
  }

  /** @returns {number|null} age in years, or null when the reply isn't an age */
  static parseAge(text) {
    const match = String(text || '').match(/\d{1,2}/);
    if (!match) return null;
    const age = parseInt(match[0], 10);
    if (!Number.isFinite(age) || age < 0 || age > 25) return null;
    return age;
  }

  // ── Composition ───────────────────────────────────────────────────────────

  /**
   * The prompt handed to the LLM.
   *
   * Contains the matched objection's evidence and NOTHING ELSE from the
   * library — no other objection's claims, no other reassurance text. That is
   * the whole safety property of this feature and there is a test pinning it.
   */
  static buildPrompt({ reason, age, objection }) {
    const entry = typeof objection === 'string' ? this.getObjection(objection) : objection;
    if (!entry) throw new Error('grandparent-bridge: unknown objection');

    const evidenceBlock = entry.evidence
      .map((e, i) => `(${i + 1}) CLAIM: ${e.claim}\n    SOURCE: ${e.source}\n    EVIDENCE QUALITY: ${e.lean_flag}`)
      .join('\n');

    return [
      'You are helping a homeschooling parent in Pakistan write a short note for a relative',
      'who keeps raising one worry about the child\'s schooling. The relative will read this note.',
      '',
      'THE PARENT TOLD US:',
      `- Why she teaches her child at home: ${reason}`,
      `- The child's age: ${age}`,
      `- The objection she keeps hearing: "${entry.objection_en}"`,
      '',
      'THE ONLY FACTS YOU MAY USE (do not add any other fact, statistic, study or claim):',
      evidenceBlock,
      '',
      'A reassurance the family already agreed on, in the right register — stay close to it:',
      `EN: ${entry.reassurance_en}`,
      `UR: ${entry.reassurance_ur}`,
      '',
      'The note must END with exactly this invitation, reworded only if it reads awkwardly:',
      `EN: ${entry.invitation_en}`,
      `UR: ${entry.invitation_ur}`,
      '',
      'RULES:',
      '1. Open by honouring the relative\'s concern. Assume it comes from care, never from malice.',
      '2. Warm, plain, "we". Zero judgment. Never argue, never score a point, never lecture.',
      `3. At most ${WORD_LIMIT} words in EACH language. Shorter is better.`,
      '4. Where the evidence above is mixed or weak, say so plainly. Do not overclaim.',
      '5. No headings, no bullet points, no emoji, no statistics beyond the claims above.',
      '6. End with the single concrete invitation. One invitation only.',
      '7. The Urdu must be natural spoken Urdu — the way a Pakistani family actually talks —',
      '   not a literal translation of the English.',
      '',
      'Reply with JSON only: {"english": "...", "urdu": "..."}',
    ].join('\n');
  }

  /**
   * Compose the one-pager text in both languages.
   *
   * Falls back to the deterministic library template whenever the LLM is
   * unreachable, unparseable, empty, or over budget — the parent always gets
   * something sendable.
   *
   * @returns {Promise<{en:string, ur:string, source:'llm'|'fallback', objection:object}>}
   */
  static async compose({ reason, age, objection }) {
    const entry = typeof objection === 'string' ? this.getObjection(objection) : objection;
    if (!entry) throw new Error('grandparent-bridge: unknown objection');

    const fallback = this.fallbackOnePager({ reason, age, objection: entry });

    try {
      // eslint-disable-next-line global-require -- lazy: never construct the SDK at module load
      const { getClient, getDefaultModel } = require('./llm-client');
      const client = getClient();
      const response = await client.chat.completions.create({
        model: getDefaultModel(),
        temperature: 0.5,
        messages: [{ role: 'user', content: this.buildPrompt({ reason, age, objection: entry }) }],
      });

      const raw = response?.choices?.[0]?.message?.content || '';
      const parsed = this.parseComposed(raw);
      if (!parsed) {
        logToFile('⚠️ Grandparent Bridge: LLM output unparseable — using fallback', { objection: entry.id });
        return { ...fallback, source: 'fallback', objection: entry };
      }

      return {
        en: this.trimToWords(parsed.english, WORD_LIMIT),
        ur: this.trimToWords(parsed.urdu, WORD_LIMIT),
        source: 'llm',
        objection: entry,
      };
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: LLM unavailable — using fallback template', {
        objection: entry.id,
        error: error.message,
      });
      return { ...fallback, source: 'fallback', objection: entry };
    }
  }

  /** @returns {{english:string, urdu:string}|null} */
  static parseComposed(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    // Models like to wrap JSON in a ```json fence — take the outermost object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      const english = String(obj.english || '').trim();
      const urdu = String(obj.urdu || '').trim();
      if (!english || !urdu) return null;
      return { english, urdu };
    } catch (_) {
      return null;
    }
  }

  /**
   * Word-count-safe trim at a sentence boundary (never mid-sentence).
   *
   * Keeps the original whitespace between sentences — blank lines are the only
   * structure this page has, and joining on a single space would flatten the
   * whole note into one paragraph. Used on LLM output; the deterministic
   * fallback fits its budget by construction instead (see fallbackOnePager).
   */
  static trimToWords(text, limit = WORD_LIMIT) {
    const clean = String(text || '').trim();
    if (this.countWords(clean) <= limit) return clean;

    // Capturing the separator keeps "\n\n" as "\n\n" on the way back out.
    const pieces = clean.split(/(?<=[.!?۔])(\s+)/);
    let kept = '';
    let count = 0;
    for (let i = 0; i < pieces.length; i += 2) {
      const sentence = pieces[i];
      const separator = pieces[i + 1] || '';
      const words = this.countWords(sentence);
      if (count + words > limit) break;
      kept += sentence + separator;
      count += words;
    }
    // A single sentence longer than the whole budget still has to be cut.
    if (!kept.trim()) return clean.split(/\s+/).slice(0, limit).join(' ');
    return kept.trim();
  }

  static countWords(text) {
    const clean = String(text || '').trim();
    return clean ? clean.split(/\s+/).length : 0;
  }

  /**
   * The deterministic one-pager: no LLM, no network, no surprises.
   *
   * Same three beats as the composed version — honour the concern, the warm
   * reassurance, the evidence in plain words, then the single invitation.
   *
   * It fits the word budget BY CONSTRUCTION rather than by trimming: the
   * opening, reassurance and invitation are required, and the evidence lines
   * are added one at a time only while they still fit. Trimming the assembled
   * page would eventually cut the invitation off the end — and the invitation
   * is the only thing on the page that actually changes anything.
   */
  static fallbackOnePager({ reason, age, objection }) {
    const entry = typeof objection === 'string' ? this.getObjection(objection) : objection;
    if (!entry) throw new Error('grandparent-bridge: unknown objection');

    // The parent's own words go in, but capped — an essay here would blow the
    // budget the relative's attention actually has.
    //
    // The body carries the library's own bilingual `evidence_summary_*` rather
    // than the raw `evidence[].claim` strings: the claims are written for the
    // sources footnote (English, with URLs and lean flags) and pasting them
    // into the Urdu pane would hand a grandparent an English paragraph. The
    // summaries say the same thing, hedges included, in both languages.
    const shortReason = this.shortenReason(reason);

    const en = this.assembleWithinBudget({
      opening: `You said: "${entry.objection_en}"\n\nIt is a fair question, and it comes from caring about her.`
        + (shortReason ? ` We teach her at home ${shortReason}.` : ''),
      reassurance: entry.reassurance_en,
      evidenceLabel: 'What we are going on:',
      evidenceLines: String(entry.evidence_summary_en).split('\n').map((l) => l.trim()).filter(Boolean),
      invitation: entry.invitation_en,
    });

    const ur = this.assembleWithinBudget({
      opening: `آپ نے کہا: "${entry.objection_ur}"\n\nیہ سوال جائز ہے، اور یہ اُسی بچی کی فکر سے نکلا ہے۔`
        + (age ? ` اُس کی عمر ${age} سال ہے۔` : ''),
      reassurance: entry.reassurance_ur,
      evidenceLabel: 'ہماری بنیاد:',
      evidenceLines: String(entry.evidence_summary_ur).split('\n').map((l) => l.trim()).filter(Boolean),
      invitation: entry.invitation_ur,
    });

    return { en, ur, source: 'fallback', objection: entry };
  }

  /**
   * Required beats first, evidence lines added while they fit, invitation last.
   * @returns {string}
   */
  static assembleWithinBudget({ opening, reassurance, evidenceLabel, evidenceLines, invitation }, limit = WORD_LIMIT) {
    const required = [opening, reassurance];
    const kept = [];
    let budget = limit - this.countWords(required.join(' ')) - this.countWords(invitation);

    for (const line of evidenceLines) {
      const cost = this.countWords(line) + (kept.length ? 0 : this.countWords(evidenceLabel));
      if (cost > budget) break;
      kept.push(line);
      budget -= cost;
    }

    const evidenceBlock = kept.length ? [evidenceLabel, ...kept].join('\n') : null;
    return [...required, evidenceBlock, invitation].filter(Boolean).join('\n\n');
  }

  /** The parent's reason, clipped to a clause that fits the budget. */
  static shortenReason(reason, maxWords = 12) {
    const clean = String(reason || '').trim().replace(/[.!?۔]+$/, '');
    if (!clean) return '';
    const words = clean.split(/\s+/);
    const clipped = words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : clean;
    return /^(because|since|so that|to )/i.test(clipped) ? clipped : `because ${clipped}`;
  }

  // ── PDF (bonus path, gated on the engine being installed) ─────────────────

  /**
   * Is the HTML→PDF engine usable in this deployment?
   *
   * Presence-gated like everything else in Rumi — but on a Chromium *binary*
   * rather than an API key, because that is what the reused pipeline needs
   * (see html-to-pdf.js#isPdfEngineAvailable). No Chromium → text-only, which
   * is a complete answer on its own.
   */
  static isPdfAvailable() {
    try {
      // eslint-disable-next-line global-require -- keeps playwright-core off the boot path
      const { isPdfEngineAvailable } = require('../utils/html-to-pdf');
      return isPdfEngineAvailable();
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: PDF engine not loadable — text only', { error: error.message });
      return false;
    }
  }

  /**
   * Render the one-pager PDF.
   * @returns {Promise<Buffer>}
   */
  static async generatePdf(composed) {
    // eslint-disable-next-line global-require -- see isPdfAvailable
    const { htmlToPdf } = require('../utils/html-to-pdf');
    const { renderGrandparentBridgeHtml } = require('../templates/grandparent-bridge.template');
    const entry = composed.objection;

    const html = renderGrandparentBridgeHtml({
      objectionEn: entry.objection_en,
      objectionUr: entry.objection_ur,
      bodyEn: composed.en,
      bodyUr: composed.ur,
      invitationEn: entry.invitation_en,
      invitationUr: entry.invitation_ur,
      evidence: entry.evidence,
      generatedOn: new Date().toISOString().split('T')[0],
    });

    return htmlToPdf(html, { timeout: 30000 });
  }

  // ── Delivery + logging ────────────────────────────────────────────────────

  /**
   * Compose, send, and log one one-pager.
   *
   * Text first, always — so a PDF failure downgrades the delivery instead of
   * losing it. (Same fail-safe order as quiz-report.service.js.)
   *
   * @returns {Promise<{objection:string, source:string, deliveredPdf:boolean}>}
   */
  static async deliver(phone, { userId, reason, age, objection }) {
    const composed = await this.compose({ reason, age, objection });
    const entry = composed.objection;

    await WhatsAppService.sendMessage(
      phone,
      `💛 Here it is — forward this to them as it is.\n\n*English*\n${composed.en}\n\n*اردو*\n${composed.ur}`
    );

    let deliveredPdf = false;
    if (this.isPdfAvailable()) {
      let tempPath = null;
      try {
        const pdfBuffer = await this.generatePdf(composed);
        tempPath = path.join(os.tmpdir(), `grandparent-bridge-${entry.id}-${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, pdfBuffer);
        const sent = await WhatsAppService.sendDocument(
          phone,
          tempPath,
          'Because-you-care.pdf',
          'And here is the same note as a one-page PDF, if that is easier to share.'
        );
        // sendDocument returns falsy on a rejected send — never log a delivery
        // that did not happen.
        deliveredPdf = Boolean(sent);
      } catch (error) {
        logToFile('⚠️ Grandparent Bridge: PDF generation/send failed — text already delivered', {
          objection: entry.id,
          error: error.message,
        });
      } finally {
        if (tempPath) { try { fs.unlinkSync(tempPath); } catch (_) { /* best effort */ } }
      }
    }

    await this.logOnePager({ phone, objectionId: entry.id, deliveredPdf });

    logToFile('✅ Grandparent Bridge one-pager delivered', {
      userId, objection: entry.id, source: composed.source, deliveredPdf,
    });
    return { objection: entry.id, source: composed.source, deliveredPdf };
  }

  /**
   * One-way hash of the phone number.
   *
   * The table exists to answer "which objections do families actually get?" —
   * that needs a stable key per family, not a reachable phone number. This is
   * the most sensitive disclosure in the product (a relative conflict inside
   * someone's house), so the number itself never lands in the row.
   */
  static hashPhone(phone) {
    return crypto.createHash('sha256').update(String(phone || '')).digest('hex');
  }

  /** Best-effort analytics write — never breaks a delivery that already happened. */
  static async logOnePager({ phone, objectionId, language = 'both', deliveredPdf = false }) {
    try {
      const { error } = await supabase.from('bridge_onepagers').insert({
        phone_hash: this.hashPhone(phone),
        objection_type: objectionId,
        language,
        delivered_pdf: Boolean(deliveredPdf),
      });
      if (error) {
        logToFile('⚠️ Grandparent Bridge: could not log one-pager', { objectionId, error: error.message });
        return false;
      }
      return true;
    } catch (error) {
      logToFile('⚠️ Grandparent Bridge: could not log one-pager', { objectionId, error: error.message });
      return false;
    }
  }
}

GrandparentBridgeService.STATES = STATES;
GrandparentBridgeService.SESSION_TTL = SESSION_TTL;
GrandparentBridgeService.WORD_LIMIT = WORD_LIMIT;
GrandparentBridgeService.QUESTIONS = QUESTIONS;

module.exports = GrandparentBridgeService;
