/**
 * Writing Feedback Service — "Writer's Second Pair of Eyes"
 *
 * A parent photographs their child's handwritten paragraph (ages ~8–13).
 * Rumi reads it with the exam-checker's OCR, drafts 2–3 specific, kind edits
 * (never a rewrite), and sends that draft to the PARENT first. The parent
 * edits it ("drop 2", "change 1: …", "add: …") or replies "send". Only on
 * confirm does Rumi produce the second message: a short "how to say this to
 * your child" script plus the final feedback.
 *
 * The human-in-the-loop step IS the product. Every 2025–26 AI essay grader
 * (Cograder, Pregrade, AutoMark) automates the whole judgment with no
 * independent validation against trained human graders, least of all for
 * younger or struggling writers. Here the parent's edits are logged as the
 * accuracy signal nobody in the market currently measures — which is why
 * `ai_draft`, `parent_final` and `edits_count` are persisted on every session
 * rather than only the delivered text.
 *
 * Voice: the Rumi Sparks register — warm, "we", zero judgment, opens by
 * assuming she is a good parent, and praises the try rather than the win.
 *
 * State machine (persisted on writing_feedback_sessions.status, Redis-cached):
 *
 *   awaiting_photo → awaiting_age → awaiting_parent_confirm → done
 *                                                          ↘ cancelled
 *
 * Reused, not reinvented:
 *   - OCR             → services/exam-checker/ocr.service.js (Mistral → Chandra)
 *   - LLM             → services/llm-client.js (the single LLM entry point)
 *   - session storage → the exam-session.service.js shape (Supabase + Redis,
 *                       24h TTL), because shared/services/session.service.js
 *                       is a message-dedup store, not a conversation-state one.
 */

const crypto = require('crypto');

const supabase = require('../config/supabase');
const redisService = require('./cache/railway-redis.service');
const OCRService = require('./exam-checker/ocr.service');
const { getClient, getDefaultModel } = require('./llm-client');
const { isFeatureAvailable } = require('../config/feature-availability');
const { logToFile } = require('../utils/logger');

// ── Session state ────────────────────────────────────────────────────────────

const STATES = {
  AWAITING_PHOTO: 'awaiting_photo',
  AWAITING_AGE: 'awaiting_age',
  AWAITING_PARENT_CONFIRM: 'awaiting_parent_confirm',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

// A session in one of these states is finished — a new request starts fresh.
const TERMINAL_STATES = [STATES.DONE, STATES.CANCELLED];

const REDIS_PREFIX = 'writing_feedback_session:';
// 24h, matching exam-checker's session TTL — the same "one sitting, and if she
// walks away it expires quietly rather than ambushing her tomorrow" behaviour
// every other multi-step feature here has.
const REDIS_TTL = 60 * 60 * 24;
const SESSION_TIMEOUT_MS = REDIS_TTL * 1000;

// ── OCR confidence ───────────────────────────────────────────────────────────

/**
 * Below this, we ask the parent to type the paragraph instead of guessing at
 * the handwriting. 0.55 is not arbitrary: OCRService._calculateConfidence()
 * starts at 0.50 and adds +0.10 studentName, +0.10 rollNumber, +0.20 detected
 * questions, +0.10 rawText > 100 chars. A child's paragraph has no name, no
 * roll number and no questions, so a CLEAN read of one tops out at exactly
 * 0.60 and a thin/garbled read sits at 0.50 — 0.55 is the only threshold that
 * separates those two outcomes. (Chandra's fallback path reports 0.70, so it
 * clears the bar on its own scale too.)
 */
const LOW_CONFIDENCE_THRESHOLD = 0.55;

// A confidence score can look fine while the extracted text is unusable, so
// substance is checked independently of the provider's own number.
const MIN_TEXT_CHARS = 40;
const MIN_TEXT_WORDS = 8;

// ── Feedback shape ───────────────────────────────────────────────────────────

const MAX_EDITS = 3;
const MAX_WHAT_WORDS = 8;
const MAX_SCRIPT_WORDS = 120;

// Keys an edit may carry. Anything else the model invents — `rewrite`,
// `rewritten_paragraph`, `full_text` — is dropped here, at the boundary,
// because a full rewrite is the exact failure mode this feature exists to
// avoid. Scope creep into "just fix the whole essay" would make Rumi one more
// unvalidated grader.
const EDIT_KEYS = ['what', 'why', 'better'];

const MIN_AGE = 5;
const MAX_AGE = 18;

const TRIGGER_KEYWORDS = [
  '/writing',
  "check my child's writing",
  'check my childs writing',
  'check my child writing',
  'check my kid writing',
  "check my kid's writing",
  'writing feedback',
  'check this paragraph',
  'check her essay',
  'check his essay',
];

// Captions that mark an inbound photo as a writing sample rather than exam
// papers or a textbook page.
const CAPTION_KEYWORDS = ['writing', 'essay', 'paragraph'];

/**
 * Is the feature switched on? Presence-gated on the SAME OCR keys the exam
 * checker uses — no new credential, and no separate enable flag.
 */
function isAvailable(env = process.env) {
  return isFeatureAvailable(
    { keysAny: ['MISTRAL_API_KEY', 'CHANDRA_API_KEY'] },
    env
  );
}

/** Would this text start a writing-feedback session? */
function shouldTriggerWritingFeedback(text) {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  if (normalized === '/writing' || normalized.startsWith('/writing ')) return true;
  return TRIGGER_KEYWORDS.some((k) => normalized.includes(k));
}

/** Does this image caption mark the photo as a writing sample? */
function captionMarksWriting(caption) {
  if (!caption) return false;
  const normalized = caption.toLowerCase();
  return CAPTION_KEYWORDS.some((k) => normalized.includes(k));
}

/**
 * A stable, non-reversible handle for the parent's number. The paragraph is a
 * child's schoolwork; the session log needs to group sessions per parent for
 * the edit-rate signal, and nothing more than that.
 */
function hashPhone(from) {
  if (!from) return null;
  return crypto.createHash('sha256').update(String(from)).digest('hex');
}

// ── Session persistence ──────────────────────────────────────────────────────

async function _getFromRedis(userId) {
  try {
    const data = await redisService.get(`${REDIS_PREFIX}${userId}`);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (error) {
    logToFile('⚠️ Writing-feedback Redis get failed', { userId, error: error.message });
    return null;
  }
}

async function _saveToRedis(userId, session) {
  try {
    await redisService.setex(`${REDIS_PREFIX}${userId}`, REDIS_TTL, JSON.stringify(session));
  } catch (error) {
    logToFile('⚠️ Writing-feedback Redis save failed', { userId, error: error.message });
  }
}

async function _clearFromRedis(userId) {
  try {
    await redisService.delete(`${REDIS_PREFIX}${userId}`);
  } catch (error) {
    logToFile('⚠️ Writing-feedback Redis clear failed', { userId, error: error.message });
  }
}

/** Has this session been sitting untouched past the timeout? */
function isExpired(session, now = Date.now()) {
  if (!session) return true;
  const stamp = session.updated_at || session.created_at;
  if (!stamp) return false;
  const age = now - new Date(stamp).getTime();
  return Number.isFinite(age) && age > SESSION_TIMEOUT_MS;
}

/**
 * The live session for this parent, or null. An expired one is cancelled so a
 * stale row can never swallow the next photo she sends.
 */
async function getActiveSession(userId) {
  const cached = await _getFromRedis(userId);
  if (cached && !TERMINAL_STATES.includes(cached.status)) {
    if (!isExpired(cached)) return cached;
    await cancelSession(cached.id);
    return null;
  }

  const { data, error } = await supabase
    .from('writing_feedback_sessions')
    .select('*')
    .eq('user_id', userId)
    .not('status', 'in', '("done","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  if (isExpired(data)) {
    await cancelSession(data.id);
    return null;
  }

  await _saveToRedis(userId, data);
  return data;
}

/** Open a session, waiting on the photo. */
async function startSession(userId, from) {
  const { data, error } = await supabase
    .from('writing_feedback_sessions')
    .insert({
      user_id: userId,
      phone_hash: hashPhone(from),
      status: STATES.AWAITING_PHOTO,
      edits_count: 0,
    })
    .select()
    .single();

  if (error) {
    logToFile('❌ Failed to create writing-feedback session', { userId, error: error.message });
    throw new Error('Failed to create writing feedback session');
  }

  logToFile('✅ Writing-feedback session started', { sessionId: data.id, userId });
  await _saveToRedis(userId, data);
  return data;
}

/**
 * Patch a session. Deliberately an update filtered on id alone, with the error
 * checked, then a SEPARATE read — never the long chain that tacks extra WHERE
 * conditions plus select/single onto the write, which can come back with both
 * data and error null and swallow a constraint rejection whole
 * (pre-merge-checklist Class D).
 */
async function updateSession(sessionId, updates) {
  const { error } = await supabase
    .from('writing_feedback_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) {
    logToFile('❌ Failed to update writing-feedback session', {
      sessionId,
      error: error.message,
    });
    throw new Error('Failed to update writing feedback session');
  }

  const { data } = await supabase
    .from('writing_feedback_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (data) {
    if (TERMINAL_STATES.includes(data.status)) {
      await _clearFromRedis(data.user_id);
    } else {
      await _saveToRedis(data.user_id, data);
    }
  }

  return data;
}

/** Close a session without delivering anything. */
async function cancelSession(sessionId) {
  try {
    return await updateSession(sessionId, { status: STATES.CANCELLED });
  } catch (error) {
    logToFile('⚠️ Failed to cancel writing-feedback session', {
      sessionId,
      error: error.message,
    });
    return null;
  }
}

// ── Step 1: read the handwriting ─────────────────────────────────────────────

/**
 * Pull the child's paragraph out of the photo using the exam checker's OCR
 * (Mistral vision → Chandra fallback). Bounding boxes are skipped: nothing
 * here annotates the image, and Surya would only add latency.
 *
 * This is the de-risking step of the whole feature — children's handwriting is
 * the hardest input the OCR path has been asked for — so a weak read is a
 * first-class outcome, not an error. `lowConfidence` means "ask her to type
 * it", never "guess and hope".
 *
 * @param {string} imageUrl
 * @returns {Promise<{text: string, confidence: number, provider: string, lowConfidence: boolean}>}
 */
async function extractText(imageUrl) {
  const result = await OCRService.extractSingle(imageUrl, false);

  const text = (result?.rawText || '').trim();
  const confidence = typeof result?.confidence === 'number' ? result.confidence : 0;
  const words = text.split(/\s+/).filter(Boolean);

  const lowConfidence =
    confidence < LOW_CONFIDENCE_THRESHOLD ||
    text.length < MIN_TEXT_CHARS ||
    words.length < MIN_TEXT_WORDS;

  logToFile('🔍 Writing-feedback OCR complete', {
    provider: result?.provider,
    confidence,
    charCount: text.length,
    wordCount: words.length,
    lowConfidence,
  });

  return {
    text,
    confidence,
    provider: result?.provider || 'unknown',
    lowConfidence,
  };
}

/** The message we send when the handwriting didn't come through. */
function lowConfidenceMessage() {
  return (
    "I couldn't read the handwriting well enough — can you type the paragraph? "
    + 'Just paste it here as a message and I\'ll work from that.'
  );
}

// ── Step 2: draft the feedback ───────────────────────────────────────────────

const DRAFT_SYSTEM_PROMPT = [
  "You help a parent give feedback on their own child's handwritten writing.",
  'The parent will read your draft FIRST and decide what to show the child.',
  '',
  'Absolute rules:',
  `- Give between 2 and ${MAX_EDITS} edits. Never more than ${MAX_EDITS}.`,
  '- NEVER rewrite the paragraph. Never return the whole text improved.',
  '- Each edit fixes ONE small thing, and rewrites only that bit.',
  '- Open with one praise line naming something SPECIFIC the child did well —',
  '  a word choice, a detail, an idea. Praise the try, not the talent.',
  '- Warm, plain, zero judgment. No grades, no scores, no labels like "weak".',
  '- Age-appropriate: explain the "why" the way you would to a child that age.',
  '',
  'Return STRICT JSON only, no markdown:',
  '{',
  '  "praise": "one sentence naming something specific the child did well",',
  '  "edits": [',
  '    {',
  `      "what": "exact quote from the child's writing, at most ${MAX_WHAT_WORDS} words",`,
  '      "why": "one short line, age-appropriate",',
  '      "better": "just that bit, improved — NOT the whole paragraph"',
  '    }',
  '  ]',
  '}',
].join('\n');

/**
 * Strip an edit down to the three fields it may have, enforce the quote
 * length, and drop anything unusable.
 */
function _normalizeEdit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const edit = {};
  for (const key of EDIT_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string' || !value.trim()) return null;
    edit[key] = value.trim();
  }

  // Trim an over-long quote rather than dropping an otherwise good point.
  const words = edit.what.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WHAT_WORDS) {
    edit.what = words.slice(0, MAX_WHAT_WORDS).join(' ');
  }

  return edit;
}

/**
 * Validate + clamp a model response into the draft contract. Exported so the
 * boundary is testable without an LLM round trip.
 *
 * Throws when there is nothing usable; clamps when there is too much.
 */
function validateDraft(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Draft feedback was not an object');
  }

  const praise = typeof parsed.praise === 'string' ? parsed.praise.trim() : '';
  if (!praise) {
    throw new Error('Draft feedback is missing the praise line');
  }

  const rawEdits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const edits = rawEdits.map(_normalizeEdit).filter(Boolean).slice(0, MAX_EDITS);

  if (edits.length === 0) {
    throw new Error('Draft feedback contained no usable edits');
  }

  return { praise, edits };
}

/**
 * Draft the feedback: one specific praise line plus 2–3 concrete edits.
 *
 * @param {{text: string, age: number}} input
 * @returns {Promise<{praise: string, edits: Array<{what: string, why: string, better: string}>}>}
 */
async function draftFeedback({ text, age }) {
  if (!text || !text.trim()) {
    throw new Error('No text to draft feedback for');
  }

  const completion = await getClient().chat.completions.create({
    model: getDefaultModel(),
    messages: [
      { role: 'system', content: DRAFT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `The child is ${age} years old.`,
          '',
          "The child's writing, exactly as transcribed:",
          text,
        ].join('\n'),
      },
    ],
    max_tokens: 700,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = completion?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty draft response from LLM');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    throw new Error(`Draft feedback was not valid JSON: ${parseError.message}`);
  }

  const draft = validateDraft(parsed);

  logToFile('✍️ Writing feedback drafted', { age, editCount: draft.edits.length });
  return draft;
}

// ── Step 3: the parent reads it first ────────────────────────────────────────

/**
 * The parent-facing draft. She sees exactly what Rumi would say, before the
 * child sees anything — and the reply menu makes editing as easy as
 * confirming, on purpose. There is deliberately no forward-to-child button:
 * skipping her judgment must stay harder than using it.
 */
function formatDraftMessage(draft) {
  const lines = [
    "📄 I've read it — and you know your child better than I do, so read this before they do.",
    '',
    `💛 What they did well: ${draft.praise}`,
    '',
    `Here ${draft.edits.length === 1 ? 'is' : 'are'} ${draft.edits.length} small thing${draft.edits.length === 1 ? '' : 's'} we could look at together:`,
    '',
  ];

  draft.edits.forEach((edit, i) => {
    lines.push(`${i + 1}. "${edit.what}"`);
    lines.push(`   Why: ${edit.why}`);
    lines.push(`   Try: ${edit.better}`);
    lines.push('');
  });

  lines.push('Your call — reply with any of these:');
  lines.push('• *send* — and I\'ll add a short script for saying it kindly');
  lines.push('• *drop 2* — take a point out');
  lines.push('• *change 1: ...* — say it in your own words');
  lines.push('• *add: ...* — add something I missed');

  return lines.join('\n');
}

const CONFIRM_WORDS = ['send', 'send it', 'ok send', 'okay send', 'confirm', 'looks good', 'go ahead'];

/**
 * Interpret the parent's reply against the current draft.
 *
 * Understood: "send", "drop N" (one or several), "change N: …",
 * "change N to …", "add: …". Anything else comes back as `unknown` with a
 * message that re-states the menu — never a silent no-op, and never a guess
 * at what she meant.
 *
 * @returns {{action: 'confirm'|'edit'|'unknown', draft: object, editsApplied: number, message?: string}}
 */
function applyParentEdits(draft, replyText) {
  const safeDraft = {
    praise: draft?.praise || '',
    edits: Array.isArray(draft?.edits) ? draft.edits.map((e) => ({ ...e })) : [],
  };

  const raw = typeof replyText === 'string' ? replyText.trim() : '';
  const normalized = raw.toLowerCase();

  if (!raw) {
    return { action: 'unknown', draft: safeDraft, editsApplied: 0, message: _menuReminder() };
  }

  if (CONFIRM_WORDS.includes(normalized)) {
    return { action: 'confirm', draft: safeDraft, editsApplied: 0 };
  }

  // add: <text> — a point of her own, in her words.
  const addMatch = raw.match(/^add\s*:?\s+(.+)$/i);
  if (addMatch) {
    const body = addMatch[1].trim();
    if (!body) {
      return { action: 'unknown', draft: safeDraft, editsApplied: 0, message: _menuReminder() };
    }
    safeDraft.edits.push({ what: '', why: '', better: body, source: 'parent' });
    return { action: 'edit', draft: safeDraft, editsApplied: 1 };
  }

  // change N: <text>  /  change N to <text>
  const changeMatch = raw.match(/^(?:change|edit|reword)\s+(\d+)\s*(?::|\bto\b)\s*(.+)$/i);
  if (changeMatch) {
    const index = parseInt(changeMatch[1], 10) - 1;
    const body = changeMatch[2].trim();
    if (index < 0 || index >= safeDraft.edits.length || !body) {
      return {
        action: 'unknown',
        draft: safeDraft,
        editsApplied: 0,
        message: _outOfRange(safeDraft.edits.length),
      };
    }
    safeDraft.edits[index] = { ...safeDraft.edits[index], better: body, source: 'parent' };
    return { action: 'edit', draft: safeDraft, editsApplied: 1 };
  }

  // drop N  /  remove 2 and 3  /  drop 1, 3
  const dropMatch = raw.match(/^(?:drop|remove|delete)\s+(.+)$/i);
  if (dropMatch) {
    const indices = (dropMatch[1].match(/\d+/g) || []).map((n) => parseInt(n, 10) - 1);
    const valid = indices.filter((i) => i >= 0 && i < safeDraft.edits.length);
    if (valid.length === 0) {
      return {
        action: 'unknown',
        draft: safeDraft,
        editsApplied: 0,
        message: _outOfRange(safeDraft.edits.length),
      };
    }
    // Drop from the back so earlier indices stay valid as we splice.
    const unique = [...new Set(valid)].sort((a, b) => b - a);
    unique.forEach((i) => safeDraft.edits.splice(i, 1));
    return { action: 'edit', draft: safeDraft, editsApplied: unique.length };
  }

  return { action: 'unknown', draft: safeDraft, editsApplied: 0, message: _menuReminder() };
}

function _menuReminder() {
  return [
    "I didn't catch that one. You can reply:",
    '• *send* — send it as it is',
    '• *drop 2* — take a point out',
    '• *change 1: ...* — say it in your own words',
    '• *add: ...* — add something I missed',
  ].join('\n');
}

function _outOfRange(count) {
  return `There ${count === 1 ? 'is' : 'are'} only ${count} point${count === 1 ? '' : 's'} right now — which number did you mean?`;
}

// ── Step 4: how to say it ────────────────────────────────────────────────────

const SCRIPT_SYSTEM_PROMPT = [
  'A parent is about to give their child feedback on a piece of writing.',
  'Write a short script for HOW to say it out loud so the child stays open',
  'and does not shut down.',
  '',
  'Rules:',
  `- At most ${MAX_SCRIPT_WORDS} words. Shorter is better.`,
  '- Start with the specific praise. Sit in it for a beat before anything else.',
  '- Frame the edits as noticing together, not correcting: "can we look at…".',
  '- Ask the child what they think; leave room for them to disagree.',
  '- Plain spoken words a parent would actually use. No headings, no bullets,',
  '  no stage directions, no numbered list.',
  '- End on something that makes them want to write again.',
].join('\n');

/** Hard-trim to the word cap; a script that runs long stops being a script. */
function _trimToWords(text, max = MAX_SCRIPT_WORDS) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ')}…`;
}

/**
 * A deterministic script for when the LLM call fails. She still gets something
 * usable — the feature does not fall over at the last step, and it never
 * pretends a script exists when it doesn't.
 */
function fallbackScript(finalFeedback) {
  const first = finalFeedback?.edits?.[0];
  const parts = [
    // No quotes around the praise: it often contains quoted words of the
    // child's own, and nested quotes read as a typo on WhatsApp.
    `Open with the praise — ${finalFeedback?.praise || 'tell them you really liked reading this'}.`,
    'Let that land. Then ask:',
    first
      ? `"Can we look at one bit together — where you wrote ${first.what || 'this part'}? What do you think we could try?"`
      : '"Can we look at one small bit together? What do you think we could try?"',
    'Let them answer first. Then: "Read it back — hear the difference? That\'s your writing getting stronger."',
  ];
  return _trimToWords(parts.join(' '));
}

/**
 * Produce the ≤120-word "how to say this to your child" script.
 *
 * @param {{praise: string, edits: Array}} finalFeedback the PARENT-approved version
 * @param {number} age
 * @returns {Promise<string>}
 */
async function deliveryScript(finalFeedback, age) {
  const points = (finalFeedback?.edits || [])
    .map((e, i) => `${i + 1}. ${[e.what && `"${e.what}"`, e.why, e.better && `→ ${e.better}`].filter(Boolean).join(' — ')}`)
    .join('\n');

  try {
    const completion = await getClient().chat.completions.create({
      model: getDefaultModel(),
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `The child is ${age} years old.`,
            '',
            `Praise to open with: ${finalFeedback?.praise || ''}`,
            '',
            'The points the parent approved:',
            points || '(none)',
          ].join('\n'),
        },
      ],
      max_tokens: 300,
      temperature: 0.4,
    });

    const script = completion?.choices?.[0]?.message?.content;
    if (!script || !script.trim()) {
      throw new Error('Empty script response from LLM');
    }
    return _trimToWords(script);
  } catch (error) {
    logToFile('⚠️ Delivery script generation failed, using fallback', {
      error: error.message,
    });
    return fallbackScript(finalFeedback);
  }
}

/**
 * The second message: the script first (it's what she needs in her hand), then
 * the feedback she approved.
 */
function formatFinalMessage(finalFeedback, script) {
  const lines = [
    '🗣️ How to say it',
    '',
    script,
    '',
    '— — —',
    '',
    '📝 What you approved',
    '',
    `💛 ${finalFeedback.praise}`,
    '',
  ];

  finalFeedback.edits.forEach((edit, i) => {
    if (edit.what) {
      lines.push(`${i + 1}. "${edit.what}"`);
      if (edit.why) lines.push(`   Why: ${edit.why}`);
      lines.push(`   Try: ${edit.better}`);
    } else {
      lines.push(`${i + 1}. ${edit.better}`);
    }
    lines.push('');
  });

  lines.push("You're the one giving this feedback — that's exactly how it should be.");

  return lines.join('\n');
}

// ── Prompts the handler sends ────────────────────────────────────────────────

function askForPhotoMessage() {
  return [
    "Let's look at it together. 📄",
    '',
    "Send me a photo of your child's paragraph — one page, as flat and bright as you can get it.",
    '',
    "Then tell me their age, so I pitch the feedback right. You'll see everything before they do.",
  ].join('\n');
}

function askForAgeMessage() {
  return 'Got it. How old is your child? (Just the number.)';
}

/** Pull an age out of a free-text reply. Returns null when there isn't one. */
function parseAge(text) {
  if (!text) return null;
  const match = String(text).match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const age = parseInt(match[1], 10);
  if (age < MIN_AGE || age > MAX_AGE) return null;
  return age;
}

function ageNotUnderstoodMessage() {
  return `I didn't catch the age — how old is your child? Any number between ${MIN_AGE} and ${MAX_AGE}.`;
}

module.exports = {
  // Gating + detection
  isAvailable,
  shouldTriggerWritingFeedback,
  captionMarksWriting,

  // State
  STATES,
  TERMINAL_STATES,
  SESSION_TIMEOUT_MS,
  isExpired,
  getActiveSession,
  startSession,
  updateSession,
  cancelSession,
  hashPhone,

  // Pipeline
  extractText,
  draftFeedback,
  validateDraft,
  applyParentEdits,
  deliveryScript,
  fallbackScript,

  // Messages
  formatDraftMessage,
  formatFinalMessage,
  lowConfidenceMessage,
  askForPhotoMessage,
  askForAgeMessage,
  ageNotUnderstoodMessage,
  parseAge,

  // Constants (exported so tests assert the real limits, not copies)
  LOW_CONFIDENCE_THRESHOLD,
  MIN_TEXT_CHARS,
  MIN_TEXT_WORDS,
  MAX_EDITS,
  MAX_WHAT_WORDS,
  MAX_SCRIPT_WORDS,
  EDIT_KEYS,
};
