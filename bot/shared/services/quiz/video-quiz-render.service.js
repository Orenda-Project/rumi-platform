'use strict';
/**
 * VideoQuizRenderService: what a child receives, and in what order.
 *
 * This is the JS port of scripts/render_contract.py in the Video Quizzes report
 * folder. That file is what the entire Phase-1 QA pass judged — every image
 * review, every audio slot audit, every pedagogy verdict was made against the
 * sequence it produces. If this file and that one disagree, the QA describes a
 * product we do not ship. Keep them in step.
 *
 * THREE PHASES, proven on a real phone across five operator review rounds:
 *
 *   QUESTION     stem -> instruction clip -> STIMULUS clip -> question image
 *   INTERACTION  the tap surface, ALWAYS the last thing before answering
 *   ANSWER       verdict naming the option the child saw -> explanation text
 *                -> explanation image -> explanation audio
 *
 * build() is PURE: a quiz_questions row in, an ordered array of send
 * instructions out. No network, no DB, no manifest lookups — the importer bakes
 * resolved public URLs into `media` precisely so that nothing at delivery time
 * depends on a derived index that can go stale (R19).
 *
 * The rules referenced throughout live in the report's FEEDBACK_RULES.md. They
 * are not style preferences; each one is a bug that reached the operator.
 */

const BUTTON_TITLE_MAX = 20;   // Meta hard limit; longer titles truncate silently
const LIST_ROW_TITLE_MAX = 24;
const LIST_ROW_DESCRIPTION_MAX = 72;  // Meta's row description cap
const MAX_BUTTONS = 3;

/**
 * What the child READS for each option.
 *
 * R2: no option may render as empty — a child cannot tap "**". An option with
 * no text of its own is named by what it IS. The ANSWER phase reuses these
 * exact labels, so the verdict can never name something that was never shown.
 */
function optionLabels(q) {
  const raw = [q.option_a, q.option_b, q.option_c, q.option_d];
  const media = q.media || {};
  const optImages = new Map((media.option_images || []).map((o) => [o.index, o.url]));
  const optAudio = new Map((media.option_audio || []).map((o) => [o.index, o.url]));
  const labels = [];
  for (let i = 0; i < raw.length; i += 1) {
    const t = (raw[i] || '').trim();
    const hasImage = optImages.has(i);
    const hasAudio = optAudio.has(i);
    if (!t && !hasImage && !hasAudio) continue;   // option does not exist
    if (t) {
      // Verbatim, and NEVER filtered: an earlier version skipped the literal
      // "-" as a placeholder, which silently blanked the minus sign where it is
      // a real option in subtraction questions.
      // The importer already stored the label the child sees,
      // INCLUDING the "1. " prefix for picture options — re-applying it here
      // produced "1. 1. Flower" on every P5 question. Caught by the
      // Python/JS parity check, not by any unit test, because both sides
      // looked individually correct.
      labels.push(t);
    } else if (hasAudio) {
      labels.push(`Sound ${i + 1}`);
    } else {
      labels.push(`Picture ${i + 1}`);
    }
  }
  return labels;
}

function correctIndices(q) {
  return String(q.correct_option || '')
    .split(',')
    .map((c) => 'ABCD'.indexOf(c.trim()))
    .filter((i) => i >= 0);
}

/** Quote a symbol-only answer so "The answer is ." does not read as a typo. */
function nameAnswer(label) {
  if (!label) return '';
  return /[\p{L}\p{N}]/u.test(label) ? label : `“${label}”`;
}

/**
 * Per-option feedback where the source has it.
 *
 * The generated half of the bank carries distractor-specific copy that names
 * the misconception ("you picked see, which is an action word"). The legacy
 * half has only a shared explanation and falls back to the generic branch.
 */
function feedbackFor(q, labels) {
  const fb = q.option_feedback || {};
  const wrong = {};
  Object.entries(fb.wrong || {}).forEach(([k, v]) => {
    if (v && String(v).trim()) wrong[Number(k)] = String(v).trim();
  });
  return { correct: (fb.correct || '').trim(), wrong };
}

/** Buttons only when every title fits; otherwise the list, which is wider. */
function pickerKind(labels) {
  const fits = labels.length <= MAX_BUTTONS
    && labels.every((l) => l.length <= BUTTON_TITLE_MAX);
  return fits ? 'buttons' : 'list';
}

/**
 * The body text that accompanies a picker.
 *
 * A list ROW TITLE is capped at 24 characters by Meta and truncates silently,
 * so "5 red pencils and 10 blue pencils" reaches a child as
 * "5 red pencils and 10 blu" — an option they cannot read, let alone choose
 * between. Whenever any option exceeds that cap, the full options are printed
 * in the body, lettered, so the row is a handle rather than the content.
 *
 * This helper exists because the picture-question branch used to hardcode
 * "Choose your answer" as its body and therefore never printed them.
 */
/**
 * Does this stem hand the whole question to a sound?
 *
 * "Listen and tap." names no subject, so the clip that follows IS the subject
 * and has to be heard before the child can answer. "When switch is open" already
 * asks the question, so a clip arriving with it can only be telling the child
 * the answer. Port of CONTENTLESS_STEM in scripts/slot_audit.py — the two are
 * the same rule and must stay in step, since the certification gate uses the
 * Python one to decide what may ship.
 */
const LISTEN_AND_IDENTIFY = new RegExp(
  '^\\s*('
  + 'listen(\\s+and\\s+\\w+)?'
  + '|tap( the)?( correct)?( sound| answer| one)?'
  + '|choose( the)?( correct)?( sound| answer| one)?'
  + '|select( the)?( correct)?( sound| answer| one)?'
  + '|which sound (is it|do you hear)|what do you hear'
  + '|سنیں(\\s*اور\\s*\\S+)?'   // سنیں (اور …)
  + '|سنو(\\s*اور\\s*\\S+)?'         // سنو (اور …)
  + ')\\s*[.?!۔]?\\s*$', 'i',
);

function isListenAndIdentify(stem) {
  return LISTEN_AND_IDENTIFY.test((stem || '').trim());
}

function askBody(stem, labels, kind, isSoundQuestion) {
  const needsSpelling = kind === 'list'
    && labels.some((l) => l.length > LIST_ROW_TITLE_MAX);
  if (needsSpelling) {
    const lettered = labels.map((l, i) => `${'ABCD'[i]}. ${l}`).join('\n');
    return `${stem}\n\n${lettered}`;
  }
  // "Which one did you hear?" belongs ONLY to a question whose subject is a
  // SOUND — i.e. one carrying a stimulus clip. Keying it on "has any audio"
  // replaced the stem of every narrated comprehension question, so a child
  // read "Which one did you hear?" above options about a coin toss. The
  // narration reads the question; it does not replace it.
  return isSoundQuestion ? 'Which one did you hear?' : stem;
}

/**
 * Build the ordered message list for one question.
 * @param {Object} q a quiz_questions row (option_a..d, correct_option, media, …)
 * @param {Object} [opts] { questionNumber, totalQuestions }
 * @returns {Array<Object>} send instructions, in order
 */
function build(q, opts = {}) {
  const media = q.media || {};
  const pattern = q.render_pattern || 'P1';
  const stem = (q.question_text || '').trim();
  const labels = optionLabels(q);
  const msgs = [];
  const add = (phase, kind, extra) => msgs.push({ phase, kind, ...extra });

  const questionAudio = media.question_audio || [];
  // a clip in the stimulus slot is only the SUBJECT of the question
  // when the stem does not already ask one. See LISTEN_AND_IDENTIFY.
  const stimulusIsSubject = !!media.stimulus_audio && isListenAndIdentify(stem);
  const stimulus = stimulusIsSubject ? media.stimulus_audio : null;
  // Anything else in that slot speaks the answer: it moves to the answer phase
  // rather than being dropped, so the child still hears it — just not first.
  const answerClip = media.answer_audio
    || (media.stimulus_audio && !stimulusIsSubject ? media.stimulus_audio : null);
  const hasListen = questionAudio.length > 0 || !!stimulus;

  // ── PHASE 1 — THE QUESTION ────────────────────────────────────────────────
  // R16: context before media. A voice note that lands before any text makes
  // the child guess what to listen FOR, and the stem then arrives after the
  // sound has already played.
  if (hasListen) {
    add('question', 'text', {
      body: `🎧 ${stem}\nListen, then choose your answer.`,
      role: 'stem_with_listen_cue',
    });
    questionAudio.forEach((url) => add('question', 'audio', { url, role: 'instruction' }));
    // R18 corrected: on a listen-and-identify item the clip the legacy
    // names "AnswerAudio" IS the sound being asked about, so it must play before
    // the picker. R18 applied that to every row carrying the filename; on the
    // 1,788 with a real stem the same clip speaks the correct option aloud.
    if (stimulus) add('question', 'audio', { url: stimulus, role: 'stimulus' });
  }

  // The question image belongs to the QUESTION whatever the pattern — except
  // P3/P4, where it rides as the header of the interactive message itself.
  // Branching on pattern instead of on what the question HOLDS silently dropped
  // the image from 457 questions ("Count the circles in the picture", no
  // picture). Order is ear-then-eye, operator-approved.
  const headerPattern = pattern === 'P3' || pattern === 'P4';
  if (media.question_image && !headerPattern) {
    add('question', 'image', {
      url: media.question_image, caption: hasListen ? '' : stem, role: 'question_image',
    });
  }

  // ── PHASE 2 — THE INTERACTION (always last before the child answers) ──────
  const optionAudio = media.option_audio || [];
  const optionImages = media.option_images || [];
  const labelled = labels.every((l) => !/^(Sound|Picture) \d+$/.test(l));

  if (pattern === 'P5' && optionImages.length) {
    if (media.grid) {
      // Don't repeat the stem: it has already been shown as the listen cue or
      // as the question image's caption.
      const said = hasListen || !!media.question_image;
      add('interaction', 'image', {
        url: media.grid, caption: said ? 'Your options:' : stem, role: 'option_grid',
      });
    }
    // R8/R15: the pictures appear in BOTH places — the grid to compare them at
    // a glance, and the Flow where each option IS its picture
    // (RadioButtonsGroup, media-size large). Showing pictures and then asking
    // the child to answer from a text list is half the feature.
    add('interaction', 'flow', {
      body: 'Now tap the picture you think is right.',
      options: labels,
      // The Flow needs RAW BASE64 (same as the storybooks Flow's start.image);
      // a URL renders a picker with titles and no pictures. Encoded at import
      // time so nothing is fetched or resized on the child's critical path.
      optionImages: optionImages.map((o) => o.b64 || null),
      optionImageUrls: optionImages.map((o) => o.url),
      role: 'picture_flow',
      fallbackKind: pickerKind(labels),
    });
  } else if ((pattern === 'P6a' || pattern === 'P6b') && !labelled) {
    // Nothing to show but the sounds, so the clips ARE the options.
    // R4: each label is a QUOTED REPLY to the clip it names — without that, a
    // column of identical voice notes and a column of labels are related only
    // by luck.
    optionAudio.forEach((o) => {
      add('interaction', 'audio', { url: o.url, role: 'option_audio', optionIndex: o.index });
      add('interaction', 'text', {
        body: `${o.index + 1}️⃣ Sound ${o.index + 1}`,
        role: 'option_label', optionIndex: o.index, anchoredToPrevious: true,
      });
    });
    const soundKind = pickerKind(labels);
    add('interaction', soundKind, {
      body: askBody('Which sound was it?', labels, soundKind, false),
      options: labels, role: 'ask',
    });
  } else if (headerPattern && media.question_image) {
    const kind = pickerKind(labels);
    if (kind === 'buttons') {
      add('interaction', 'buttons', {
        body: stem, options: labels, headerImage: media.question_image, role: 'ask',
      });
    } else {
      // A LIST message cannot carry an image header — Meta allows only a text
      // header on interactive lists. So the picture goes as its own message
      // first, then the list. Attaching headerImage to a list would have been
      // silently dropped by Meta and the child would answer a question about a
      // picture they never saw (161 P4 questions).
      add('interaction', 'image', {
        url: media.question_image, caption: stem, role: 'question_image',
      });
      // The stem is already the image caption, so the body's job here is to
      // spell out any option too long for a 24-char row title.
      add('interaction', 'list', {
        body: askBody('Choose your answer', labels, 'list', false),
        options: labels, role: 'ask',
      });
    }
  } else {
    // R9: for a phonics item the target sound belongs to the QUESTION, not the
    // options. Playing every option's clip and then asking "which one is it"
    // assesses nothing — the child has just heard them all, in order. So when
    // the options have text, they are READ, never auto-played.
    const kind = pickerKind(labels);
    add('interaction', kind, {
      body: askBody(stem, labels, kind, !!stimulus), options: labels, role: 'ask',
    });
  }

  // ── PHASE 3 — THE ANSWER ─────────────────────────────────────────────────
  // §4b invariant: every question, every pattern, both outcomes — and the
  // verdict names the option using the SAME label the picker showed.
  const idx = correctIndices(q);
  const rightLabels = idx.map((i) => labels[i]).filter(Boolean);
  const rightText = rightLabels.map(nameAnswer).join(' and ');
  const expl = (q.explanation || '').trim();
  const fb = feedbackFor(q, labels);

  add('answer', 'text', {
    body: fb.correct || `✅ Correct! The answer is ${rightText}.${expl ? `\n\n${expl}` : ''}`,
    role: 'feedback_correct',
  });
  labels.forEach((label, i) => {
    if (idx.includes(i)) return;
    add('answer', 'text', {
      body: fb.wrong[i]
        || `Not quite — the answer is ${rightText}.${expl ? `\n\n${expl}` : ''}`
           + '\n\nKeep going, mistakes help you learn!',
      role: 'feedback_incorrect', optionIndex: i,
    });
  });
  if (media.explanation_image) {
    // R11/R17: kept only where a per-item verdict says the art explains THIS
    // question. Neither a blanket keep nor a blanket strip was right.
    add('answer', 'image', { url: media.explanation_image, role: 'explanation_image' });
  }
  // the spoken answer lands here, after the verdict and before the
  // explanation that unpacks it.
  if (answerClip) {
    add('answer', 'audio', { url: answerClip, role: 'answer_audio' });
  }
  if (media.explanation_audio) {
    add('answer', 'audio', { url: media.explanation_audio, role: 'explanation_audio' });
  }

  msgs.forEach((m, i) => { m.seq = i; });
  return msgs;
}

/** Button/row id the picker emits: vq_<questionId>_<optionIndex>. */
function answerId(questionId, index) {
  return `vq_${questionId}_${index}`;
}

/**
 * Parse a tap back to (questionId, optionIndex).
 * Returns null for ids belonging to any other feature — the router must not
 * claim `quiz_*` (the parent-quiz feature) or `student_video_feedback_*`.
 */
function parseAnswer(id) {
  // The `vq_` prefix alone is the discriminator — no other feature emits it.
  // An earlier version also demanded a UUID-shaped id, which would have
  // rejected any future id format for no safety gain.
  const m = /^vq_(.+)_(\d+)$/.exec(id || '');
  if (!m) return null;
  return { questionId: m[1], index: Number(m[2]) };
}

module.exports = {
  build,
  optionLabels,
  correctIndices,
  answerId,
  parseAnswer,
  BUTTON_TITLE_MAX,
  LIST_ROW_TITLE_MAX,
  LIST_ROW_DESCRIPTION_MAX,
  askBody,
};
