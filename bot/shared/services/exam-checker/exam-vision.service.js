/**
 * Exam-checker vision engine: two calls to one vision model.
 *
 *   Call A  readPage()      — copy each answer exactly as the student wrote it
 *                             and put a box around it, with the MARKING SCHEME
 *                             WITHHELD. A vision model that reads and grades in
 *                             one pass quietly corrects a wrong answer ("2x3=5"
 *                             becomes 6) and then marks it right; keeping the
 *                             scheme out of the read keeps the copy honest.
 *   Call B  gradeAnswers()  — grade the copied text against the scheme (the
 *                             teacher's, or one the model works out itself) and
 *                             write feed-up / feed-back / feed-forward.
 *
 * A page whose answers come back mostly low-confidence is read once more on a
 * stronger model (readPageWithEscalation). The models are model-registry jobs —
 * exam.read, exam.readHard, exam.grade — so a deployment moves them with
 * EXAM_CHECKER_MODEL / EXAM_CHECKER_HARD_MODEL, not a code change. Calls go
 * through llm-client like every other LLM call.
 *
 * Box convention: box_2d = [ymin, xmin, ymax, xmax], integers on a 0–1000 grid
 * (the Gemini convention). Divide by 1000 and multiply by the image size to
 * get pixels.
 */

const { getClientForModel, getProviderInfo } = require('../llm-client');
const { logToFile } = require('../../utils/logger');

// OpenRouter only: route to the fastest host for the model, and let it fall
// back to another host. Direct OpenAI rejects an unknown `provider` field.
const PROVIDER_ROUTING = { sort: 'throughput', allow_fallbacks: true };
const DEFAULT_TIMEOUT_MS = 120000;

// An answer below this confidence counts as hard to read; a page escalates when
// more than a quarter of its answers (and at least two) are hard to read.
const LOW_CONFIDENCE = 0.6;
const ESCALATE_SHARE = 0.25;

const JOBS = Object.freeze({ read: 'exam.read', readHard: 'exam.readHard', grade: 'exam.grade' });

// Call A — transcribe EXACTLY (errors and all), locate each answer, detect
// script. Deliberately introduces NO grading concept (no scheme, no expected
// answers, no scoring) so the model cannot "fix" the student before grading.
const CALL_A_SYS = `You transcribe a scanned/photographed student exam page. RULES:
- Transcribe EXACTLY what the student wrote, INCLUDING errors, misspellings, and crossings-out. DO NOT change anything. If a student wrote "2x3=5", transcribe "5", never "6".
- Identify each question and the student's written response to it.
- For EACH response, return box_2d = [ymin,xmin,ymax,xmax] as integers normalized 0-1000 (Gemini convention) tightly around the student's written response region (not the printed question).
- Detect script per response: "ur" (Urdu), "en" (English), or "mixed".
- Record ONLY what is physically on the page. Do NOT judge, score, or decide what the response should have been.
Respond with STRICT JSON only, no prose:
{"page_meta":{"student_name":str|null,"grade":str|null,"subject":str|null},
 "items":[{"question_id":str,"question_text":str,"answer_text_verbatim":str,"box_2d":[int,int,int,int],"script":"ur"|"en"|"mixed","confidence":number}]}`;

// Call B — grade the already-transcribed text, reasoning first: the model must
// (1) decide if the question can be graded from the page at all, (2) work out
// the correct answer ITSELF rather than echo the student, then (3) grade. It may
// ABSTAIN ("cannot_grade") on a question that needs information not on the page
// (audio, dictation, an unseen image, an external key) instead of faking a mark.
const CALL_B_SYS = `You grade a primary-school exam from the page. You are given each question and the student's VERBATIM response (already transcribed — treat it as the exact ground truth of what the student wrote; do NOT re-read or change it). A marking scheme MAY be provided.

For EACH question, in this order:
1. GRADEABLE? Decide whether you can mark it from what is available. It is NOT gradeable if a correct answer depends on information that is not present — e.g. audio the teacher reads aloud ("circle the words you hear", "the word your teacher will read out", "tick the correct sound"), a listening or dictation track, an image/diagram you cannot see, or an external answer key you were not given. If it is NOT gradeable: set verdict="cannot_grade", awarded_marks=0, max_marks=0, and DO NOT guess a mark.
2. CORRECT ANSWER. If it IS gradeable, take expected_answer from the scheme when provided; otherwise work out the correct answer YOURSELF from subject knowledge and the question — independently. DO NOT copy the student's response into expected_answer.
3. GRADE. Compare the student's verbatim response to the correct answer → verdict "correct" | "partial" | "wrong". max_marks = the scheme's marks if given, else 1. NEVER invent fractional weights. awarded_marks = full marks for "correct", zero for "wrong"; partial ONLY when the scheme defines partial credit — otherwise use full marks or zero.
4. Hattie feedback (each one short sentence, grade-appropriate language): feedback_up = what the student attempted; feedback_back = where/why it went wrong (for cannot_grade, what you'd need to mark it); feedback_forward = the single next step.

Respond with STRICT JSON only, no prose:
{"items":[{"question_id":str,"expected_answer":str,"awarded_marks":number,"max_marks":number,"verdict":"correct"|"partial"|"wrong"|"cannot_grade","feedback_up":str,"feedback_back":str,"feedback_forward":str}],
 "total_awarded":number,"total_max":number}`;

/**
 * One call returning parsed JSON. Throws (never returns null) on a transport
 * failure or an unparseable reply, so the worker's error path can tell the
 * teacher rather than silently store nothing. No SDK retries: a retry here
 * would multiply latency on a bad host, and the caller owns escalation.
 */
async function _call(job, messages, { maxTokens = 4000, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { client, model } = getClientForModel(null, { job });
  const params = {
    model,
    messages,
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
  };
  if (getProviderInfo().provider === 'openrouter') params.provider = PROVIDER_ROUTING;

  const resp = await client.chat.completions.create(params, { timeout: timeoutMs, maxRetries: 0 });
  const content = resp.choices?.[0]?.message?.content ?? '';
  try {
    return { parsed: JSON.parse(content), usage: resp.usage || {}, model };
  } catch (e) {
    throw new Error(`exam-vision ${model}: failed to parse JSON response (${e.message}); head="${String(content).slice(0, 120)}"`);
  }
}

/**
 * Call A — a faithful read of one page.
 * @param {string} imageUrl  an image the model can fetch: a `data:image/...;base64,…`
 *   URL (what a private bucket needs — see toDataUrl) or a public https URL.
 * @param {object} [opts]    { hard = false } — read on the exam.readHard model
 * @returns {Promise<{page_meta:object, items:Array, _model:string, _usage:object}>}
 */
async function readPage(imageUrl, { hard = false } = {}) {
  const messages = [
    { role: 'system', content: CALL_A_SYS },
    { role: 'user', content: [
      { type: 'text', text: 'Transcribe this exam page exactly, with answer boxes. JSON only.' },
      { type: 'image_url', image_url: { url: imageUrl } },
    ] },
  ];
  const { parsed, usage, model } = await _call(hard ? JOBS.readHard : JOBS.read, messages, { maxTokens: 4000 });
  return { page_meta: parsed.page_meta || {}, items: parsed.items || [], _model: model, _usage: usage };
}

/**
 * Call A, read once more on the stronger model when the page is hard to read:
 * more than a quarter of the detected answers (and at least two) below 0.6.
 */
async function readPageWithEscalation(imageUrl) {
  const first = await readPage(imageUrl);
  const items = first.items || [];
  const lowConf = items.filter(i => (i.confidence ?? 1) < LOW_CONFIDENCE).length;
  if (lowConf > Math.max(1, items.length * ESCALATE_SHARE)) {
    logToFile('🔎 exam-vision: low-confidence page → reading again on the stronger model', { lowConf, total: items.length });
    return readPage(imageUrl, { hard: true });
  }
  return first;
}

/**
 * Call B — grade the copied answers against the marking scheme.
 * @param {Array}  items   Call A items (question_id / question_text / answer_text_verbatim / …)
 * @param {object} scheme  marking scheme ({ questions: [{ id, answer, marks }] }); may be {} to infer
 * @param {object} meta    { grade, subject }
 * @returns {Promise<{items:Array, total_awarded:number, total_max:number, _model:string, _usage:object}>}
 */
async function gradeAnswers(items, scheme = {}, meta = {}) {
  // Only the copied text reaches the grader: no boxes, no image. Call B grades
  // what Call A read; it never re-reads the page.
  const qa = (items || []).map(it => ({
    question_id: it.question_id,
    question_text: it.question_text,
    answer_text_verbatim: it.answer_text_verbatim,
  }));
  const messages = [
    { role: 'system', content: CALL_B_SYS },
    { role: 'user', content:
      `Grade — grade ${meta.grade || '?'}, subject ${meta.subject || '?'}.\n` +
      `Marking scheme: ${JSON.stringify(scheme || {})}\n` +
      `Questions + verbatim answers:\n${JSON.stringify(qa, null, 1)}` },
  ];
  const { parsed, usage, model } = await _call(JOBS.grade, messages, { maxTokens: 3000 });
  return {
    items: parsed.items || [],
    total_awarded: parsed.total_awarded ?? 0,
    total_max: parsed.total_max ?? 0,
    _model: model,
    _usage: usage,
  };
}

/** Build a base64 data URL from an image buffer (a private bucket needs no presign this way). */
function toDataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
}

module.exports = {
  readPage,
  readPageWithEscalation,
  gradeAnswers,
  toDataUrl,
  JOBS,
  LOW_CONFIDENCE,
  CALL_A_SYS,
  CALL_B_SYS,
};
