'use strict';
/**
 * bd-2306 — the three-phase render contract for video quizzes.
 *
 * Every assertion here encodes a rule the operator taught us on a real phone
 * across five review rounds (FEEDBACK_RULES.md R1-R19). They are written as
 * tests because each one was, at some point, silently violated by code that
 * looked correct.
 *
 * The reference implementation is scripts/render_contract.py in the Video
 * Quizzes report folder; this is its port. If the two disagree, the QA that ran
 * against the Python one does not describe what we ship.
 */
const render = require('../../bot/shared/services/quiz/video-quiz-render.service');

const A = 'https://cdn.test/quiz-audio-opus';
const I = 'https://cdn.test/quiz-assets';

/** A quiz_questions row as the importer writes it. */
function row(over = {}) {
  return {
    id: 'q1',
    question_text: 'What was outside the window?',
    option_a: 'Flower', option_b: 'Mano', option_c: 'Dog', option_d: null,
    correct_option: 'B',
    explanation: 'It was Mano.',
    option_feedback: null,
    media: {},
    render_pattern: 'P1',
    ...over,
  };
}

const phases = (msgs) => msgs.map((m) => m.phase);
const kinds = (msgs) => msgs.map((m) => `${m.kind}:${m.role}`);
const ask = (msgs) => msgs.find((m) => m.role === 'ask' || m.role === 'picture_flow');

describe('phase order', () => {
  test('the three phases never interleave', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a',
      media: { question_audio: [`${A}/q.ogg`], stimulus_audio: `${A}/s.ogg`,
               explanation_audio: `${A}/e.ogg` },
    }));
    const order = phases(msgs);
    const first = { question: order.indexOf('question'), interaction: order.indexOf('interaction'), answer: order.indexOf('answer') };
    expect(first.question).toBeLessThan(first.interaction);
    expect(first.interaction).toBeLessThan(first.answer);
    // no phase resumes after a later one has started
    expect(order).toEqual([...order].sort(
      (a, b) => ['question', 'interaction', 'answer'].indexOf(a) - ['question', 'interaction', 'answer'].indexOf(b)));
  });

  test('R16 — the answer picker is the LAST thing before answering', () => {
    const msgs = render.build(row({
      render_pattern: 'P5',
      media: { grid: `${I}/grid.png`, option_images: [{ index: 0, url: `${I}/a.png` }] },
    }));
    const interaction = msgs.filter((m) => m.phase === 'interaction');
    expect(['ask', 'picture_flow']).toContain(interaction[interaction.length - 1].role);
  });

  // bd-2354: both tests below originally used the default content-bearing stem
  // ("What was outside the window?"), which asserted R18's over-generalisation
  // as if it were the contract. A stimulus is only a stimulus on a
  // listen-and-identify item, so the fixtures now say so.
  test('R16/R18 — instruction clip plays BEFORE the stimulus clip', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a', question_text: 'Listen and tap.',
      media: { question_audio: [`${A}/instruction.ogg`], stimulus_audio: `${A}/sss.ogg` },
    }));
    const audio = msgs.filter((m) => m.kind === 'audio' && m.phase === 'question');
    expect(audio.map((m) => m.role)).toEqual(['instruction', 'stimulus']);
  });

  test('R18 — the stimulus plays BEFORE the child answers, never as feedback', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a', question_text: 'Listen and tap.',
      media: { stimulus_audio: `${A}/sss.ogg` },
    }));
    const stim = msgs.find((m) => m.role === 'stimulus');
    expect(stim.phase).toBe('question');
    expect(msgs.indexOf(stim)).toBeLessThan(msgs.indexOf(ask(msgs)));
  });

  test('R16 — a stem always precedes the clip it introduces', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a', media: { question_audio: [`${A}/q.ogg`] },
    }));
    expect(msgs[0].kind).toBe('text');
    expect(msgs[0].body).toContain('What was outside the window?');
  });
});

/**
 * bd-2354 — a clip that speaks the answer must never play before the child answers.
 *
 * R18 concluded that the legacy `AnswerAudio` clip is the SOUND BEING ASKED
 * ABOUT and re-slotted it into the question phase. That is true for exactly 32
 * questions in the corpus — all Grade 1 English, all with the stem "Listen and
 * tap." — and false for the other 1,788, whose `AnswerAudio` speaks the correct
 * option aloud ("Electricity is blocked.", "Winter.", "True."). The evidence was
 * sampled from phonics and applied to every row that shared the filename.
 *
 * The discriminator is the STEM, not the filename and not the slot: if the stem
 * already asks a question, the clip cannot be the thing being identified.
 * Anything else plays AFTER the tap, where the answer belongs.
 */
describe('bd-2354 — a pre-answer clip may never speak the answer', () => {
  const leaky = {
    id: 'q-circuits',
    question_text: 'When switch is open',
    option_a: 'electricity is blocked', option_b: 'electricity is flowing',
    option_c: 'appliances are working', option_d: 'Bulb is glowing',
    correct_option: 'A',
    explanation: 'When a switch is open, electricity will not flow.',
    option_feedback: null,
    render_pattern: 'P6a',
    media: {
      question_audio: [`${A}/Question8QuestionAudio.ogg`],
      stimulus_audio: `${A}/Question8AnswerAudio.ogg`,
      explanation_audio: `${A}/Question8ExplanationAudio.ogg`,
    },
  };

  test('the answer clip does not play in the question phase', () => {
    const msgs = render.build(leaky);
    const preAnswer = msgs
      .filter((m) => m.kind === 'audio' && m.phase !== 'answer')
      .map((m) => m.url);
    expect(preAnswer).not.toContain(`${A}/Question8AnswerAudio.ogg`);
  });

  test('a content-bearing stem gets exactly ONE clip before the picker', () => {
    const msgs = render.build(leaky);
    const preAnswer = msgs.filter((m) => m.kind === 'audio' && m.phase !== 'answer');
    expect(preAnswer.map((m) => m.role)).toEqual(['instruction']);
  });

  test('the answer clip is replayed AFTER the tap, before the explanation', () => {
    const msgs = render.build(leaky);
    const answerAudio = msgs.filter((m) => m.kind === 'audio' && m.phase === 'answer');
    expect(answerAudio.map((m) => m.role)).toEqual(['answer_audio', 'explanation_audio']);
    // it is moved, never dropped — the child still hears it
    expect(answerAudio[0].url).toBe(`${A}/Question8AnswerAudio.ogg`);
  });

  test('the picker keeps the real stem, not "Which one did you hear?"', () => {
    const msgs = render.build(leaky);
    expect(ask(msgs).body).toContain('When switch is open');
    expect(ask(msgs).body).not.toContain('Which one did you hear?');
  });

  test('the listen cue is not shown when nothing is being identified', () => {
    const msgs = render.build({ ...leaky, media: { stimulus_audio: `${A}/ans.ogg` } });
    const preAnswer = msgs.filter((m) => m.kind === 'audio' && m.phase !== 'answer');
    expect(preAnswer).toHaveLength(0);
    expect(msgs[0].body).not.toContain('Listen, then choose your answer');
  });

  test('a genuine listen-and-identify item is untouched', () => {
    const msgs = render.build(row({
      question_text: 'Listen and tap.', render_pattern: 'P6a',
      option_a: 's', option_b: 'p', option_c: null, correct_option: 'A',
      media: { question_audio: [`${A}/instruction.ogg`], stimulus_audio: `${A}/sss.ogg` },
    }));
    const preAnswer = msgs.filter((m) => m.kind === 'audio' && m.phase !== 'answer');
    expect(preAnswer.map((m) => m.role)).toEqual(['instruction', 'stimulus']);
    expect(ask(msgs).body).toBe('Which one did you hear?');
    expect(msgs.filter((m) => m.role === 'answer_audio')).toHaveLength(0);
  });

  // Kept in step with CONTENTLESS_STEM in slot_audit.py: both cover a bare
  // سنیں / سنو and one following word. "سنیں اور ٹیپ کریں۔" matches NEITHER —
  // if that stem ever appears in the corpus, both rules need widening together.
  test('Urdu listen-and-identify is recognised too', () => {
    const msgs = render.build(row({
      question_text: 'سنیں۔', render_pattern: 'P6a',
      media: { stimulus_audio: `${A}/urdu.ogg` },
    }));
    expect(msgs.some((m) => m.role === 'stimulus' && m.phase === 'question')).toBe(true);
  });

  test('an explicit answer_audio slot always plays after the tap', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a', media: { answer_audio: `${A}/ans.ogg` },
    }));
    const clip = msgs.find((m) => m.role === 'answer_audio');
    expect(clip.phase).toBe('answer');
    expect(msgs.indexOf(clip)).toBeGreaterThan(msgs.indexOf(ask(msgs)));
  });

  test('the genuine two-part stem is not mistaken for a leak', () => {
    const msgs = render.build(row({
      question_text: 'A_lives underwater and a_can fly.', render_pattern: 'P6a',
      media: { question_audio: [`${A}/QuestionPart1Audio.ogg`, `${A}/QuestionPart2Audio.ogg`] },
    }));
    const preAnswer = msgs.filter((m) => m.kind === 'audio' && m.phase !== 'answer');
    expect(preAnswer.map((m) => m.role)).toEqual(['instruction', 'instruction']);
  });
});

describe('media the question actually holds', () => {
  test('a question image is sent even when the pattern is audio-led (P6a)', () => {
    // 342 P6a + 115 P5 questions hold a question image. An earlier branch
    // structure emitted it only for P3/P4, so "Count the circles in the
    // picture" arrived with no picture.
    const msgs = render.build(row({
      render_pattern: 'P6a',
      question_text: 'Count the number of circles in the picture',
      media: { question_audio: [`${A}/q.ogg`], question_image: `${I}/circles.png` },
    }));
    expect(msgs.some((m) => m.kind === 'image' && m.role === 'question_image')).toBe(true);
  });

  test('ear then eye — the clip lands before the picture', () => {
    const msgs = render.build(row({
      render_pattern: 'P6a',
      media: { question_audio: [`${A}/q.ogg`], question_image: `${I}/p.png` },
    }));
    const a = msgs.findIndex((m) => m.kind === 'audio');
    const i = msgs.findIndex((m) => m.kind === 'image');
    expect(a).toBeLessThan(i);
  });

  test('P3/P4 carry the image as the interactive header, never twice', () => {
    const msgs = render.build(row({
      render_pattern: 'P3', option_c: null,
      media: { question_image: `${I}/p.png` },
    }));
    const imageSends = msgs.filter((m) => m.kind === 'image');
    expect(imageSends).toHaveLength(0);
    expect(ask(msgs).headerImage).toBe(`${I}/p.png`);
  });

  test('R15 — picture options appear in BOTH the grid and the Flow', () => {
    const msgs = render.build(row({
      render_pattern: 'P5',
      media: { grid: `${I}/grid.png`,
               option_images: [{ index: 0, url: `${I}/a.png` }, { index: 1, url: `${I}/b.png` }] },
    }));
    expect(msgs.some((m) => m.role === 'option_grid')).toBe(true);
    expect(msgs.some((m) => m.kind === 'flow')).toBe(true);
  });
});

describe('options a child can actually tap', () => {
  test('R2 — an option with no text is named, never blank', () => {
    const msgs = render.build(row({
      render_pattern: 'P6b', option_a: '', option_b: '', option_c: '',
      media: { option_audio: [{ index: 0, url: `${A}/1.ogg` }, { index: 1, url: `${A}/2.ogg` }] },
    }));
    const labels = ask(msgs).options;
    expect(labels.every((l) => l && l.trim())).toBe(true);
    expect(labels[0]).toMatch(/Sound 1/);
  });

  test('R4 — each audio option label is anchored to the clip it names', () => {
    const msgs = render.build(row({
      render_pattern: 'P6b', option_a: '', option_b: '',
      media: { option_audio: [{ index: 0, url: `${A}/1.ogg` }, { index: 1, url: `${A}/2.ogg` }] },
    }));
    const labelMsgs = msgs.filter((m) => m.role === 'option_label');
    expect(labelMsgs).toHaveLength(2);
    labelMsgs.forEach((m) => expect(m.anchoredToPrevious).toBe(true));
  });

  test('R9 — labelled audio options are NOT played back before the question', () => {
    // Playing every option aloud then asking "which was it" tests nothing.
    const msgs = render.build(row({
      render_pattern: 'P6a', option_a: 's', option_b: 'p',
      media: { question_audio: [`${A}/q.ogg`],
               option_audio: [{ index: 0, url: `${A}/1.ogg` }, { index: 1, url: `${A}/2.ogg` }] },
    }));
    expect(msgs.some((m) => m.role === 'option_audio')).toBe(false);
  });

  test('4 options go to a list; <=3 short ones go to buttons', () => {
    const four = render.build(row({ option_d: 'Ball', render_pattern: 'P2' }));
    expect(ask(four).kind).toBe('list');
    const three = render.build(row());
    expect(ask(three).kind).toBe('buttons');
  });

  test('long options go to a list even when there are only three', () => {
    const msgs = render.build(row({
      option_a: 'A very long option that exceeds the twenty character button title cap',
    }));
    expect(ask(msgs).kind).toBe('list');
  });
});

describe('feedback (§4b invariant)', () => {
  test('both outcomes exist for every question', () => {
    const msgs = render.build(row());
    expect(msgs.some((m) => m.role === 'feedback_correct')).toBe(true);
    expect(msgs.some((m) => m.role === 'feedback_incorrect')).toBe(true);
  });

  test('the verdict names the label the child actually saw', () => {
    const msgs = render.build(row({
      render_pattern: 'P6b', option_a: '', option_b: '', correct_option: 'B',
      media: { option_audio: [{ index: 0, url: `${A}/1.ogg` }, { index: 1, url: `${A}/2.ogg` }] },
    }));
    expect(msgs.find((m) => m.role === 'feedback_correct').body).toContain('Sound 2');
  });

  test('a symbol-only answer is quoted so it does not read as a typo', () => {
    const msgs = render.build(row({
      option_a: '.', option_b: ',', option_c: null, correct_option: 'A',
    }));
    expect(msgs.find((m) => m.role === 'feedback_correct').body).toContain('“.”');
  });

  test('distractor-specific feedback is used when the question has it', () => {
    const msgs = render.build(row({
      correct_option: 'A',
      option_feedback: { correct: 'Great! Red is an adjective.',
                         wrong: { 1: 'You picked see, an action word.' } },
    }));
    expect(msgs.find((m) => m.role === 'feedback_correct').body)
      .toBe('Great! Red is an adjective.');
    const wrong = msgs.filter((m) => m.role === 'feedback_incorrect');
    expect(wrong.find((m) => m.optionIndex === 1).body)
      .toBe('You picked see, an action word.');
  });

  test('legacy questions fall back to one generic incorrect branch', () => {
    const msgs = render.build(row());
    const wrong = msgs.filter((m) => m.role === 'feedback_incorrect');
    expect(wrong.length).toBeGreaterThan(0);
    wrong.forEach((m) => expect(m.body).toContain('Mano'));
  });

  test('explanation image and audio arrive after the verdict', () => {
    const msgs = render.build(row({
      media: { explanation_image: `${I}/e.png`, explanation_audio: `${A}/e.ogg` },
    }));
    const verdict = msgs.findIndex((m) => m.role === 'feedback_correct');
    const img = msgs.findIndex((m) => m.role === 'explanation_image');
    const aud = msgs.findIndex((m) => m.role === 'explanation_audio');
    expect(img).toBeGreaterThan(verdict);
    expect(aud).toBeGreaterThan(img);
  });
});

describe('R1 — never reference media that is not attached', () => {
  test('no message points at a url the question does not carry', () => {
    const msgs = render.build(row());
    msgs.forEach((m) => {
      if (m.kind === 'audio' || m.kind === 'image') expect(m.url).toBeTruthy();
    });
  });

  test('a missing grid falls back to a numbered picker, not a broken image', () => {
    const msgs = render.build(row({
      render_pattern: 'P5', media: { option_images: [{ index: 0, url: `${I}/a.png` }] },
    }));
    expect(msgs.some((m) => m.role === 'option_grid')).toBe(false);
    expect(ask(msgs)).toBeTruthy();
  });
});

describe('answer parsing round-trip', () => {
  test('a button id emitted by the renderer parses back to its option index', () => {
    const msgs = render.build(row());
    const a = ask(msgs);
    a.options.forEach((_, i) => {
      expect(render.parseAnswer(`vq_${'q1'}_${i}`)).toEqual({ questionId: 'q1', index: i });
    });
  });

  test('a foreign button id is not claimed', () => {
    expect(render.parseAnswer('quiz_abc_A')).toBeNull();
    expect(render.parseAnswer('student_video_feedback_yes_x')).toBeNull();
  });
});

describe('options a child can actually READ (operator round 6)', () => {
  const longOpts = () => row({
    question_text: 'What combination of pencils will make 43 pencils?',
    option_a: '5 red pencils and 10 blue pencils',
    option_b: '8 red pencils and 15 blue pencils',
    option_c: '23 blue pencils, and 19 red pencils',
    option_d: '23 blue, 10 red, and 10 green pencils',
    correct_option: 'C',
  });

  test('options too long for a 24-char row title are spelled out in the body', () => {
    // The operator received "5 red pencils and 10 blu" and "23 blue pencils, and 19"
    // as things to choose between — Meta truncates row titles silently.
    const ask = render.build(longOpts()).find((m) => m.role === 'ask');
    expect(ask.kind).toBe('list');
    expect(ask.body).toContain('A. 5 red pencils and 10 blue pencils');
    expect(ask.body).toContain('C. 23 blue pencils, and 19 red pencils');
  });

  test('a picture question with long options also spells them out', () => {
    // This branch hardcoded "Choose your answer" and printed no options at all.
    const msgs = render.build({
      ...longOpts(), render_pattern: 'P4',
      media: { question_image: `${I}/sum.png` },
    });
    const ask = msgs.find((m) => m.role === 'ask');
    expect(ask.kind).toBe('list');
    expect(ask.body).toContain('5 red pencils and 10 blue pencils');
  });

  test('short options are NOT padded with a redundant list', () => {
    const ask = render.build(row({ option_d: 'Ball' })).find((m) => m.role === 'ask');
    expect(ask.body).toBe('What was outside the window?');
  });

  test('"Which one did you hear?" is used ONLY when the subject is a sound', () => {
    // A narrated comprehension question had its stem replaced by this prompt.
    const narrated = render.build(row({
      question_text: 'Why is there a coin toss before a game?',
      media: { question_audio: [`${A}/narration.ogg`] },
    })).find((m) => m.role === 'ask');
    expect(narrated.body).toContain('Why is there a coin toss');

    // bd-2354: this fixture used to keep the default stem ("What was outside
    // the window?"), so it asserted the replacement on a question whose subject
    // is plainly not a sound — the very thing the test name forbids.
    const phonics = render.build(row({
      question_text: 'Listen and tap.',
      render_pattern: 'P6a', option_a: 's', option_b: 'p', option_c: null,
      media: { question_audio: [`${A}/q.ogg`], stimulus_audio: `${A}/sss.ogg` },
    })).find((m) => m.role === 'ask');
    expect(phonics.body).toBe('Which one did you hear?');
  });
});

describe('picture Flow carries base64, not URLs (bd-2309)', () => {
  const picQ = (over = {}) => row({
    render_pattern: 'P5', option_a: '1. Cat', option_b: '2. Dog', option_c: null,
    media: {
      grid: `${I}/grid.png`,
      option_images: [
        { index: 0, url: `${I}/cat.png`, b64: 'AAAAcat' },
        { index: 1, url: `${I}/dog.png`, b64: 'AAAAdog' },
      ],
    },
    ...over,
  });

  test('the Flow gets base64 — a URL renders a picker with no pictures', () => {
    const flow = render.build(picQ()).find((m) => m.kind === 'flow');
    expect(flow.optionImages).toEqual(['AAAAcat', 'AAAAdog']);
  });

  test('a question missing base64 yields nulls so the sender can fall back', () => {
    const noB64 = picQ({
      media: {
        grid: `${I}/grid.png`,
        option_images: [{ index: 0, url: `${I}/cat.png` }, { index: 1, url: `${I}/dog.png` }],
      },
    });
    const flow = render.build(noB64).find((m) => m.kind === 'flow');
    expect(flow.optionImages).toEqual([null, null]);
    // and the numbered labels are still there for the fallback picker
    expect(flow.options).toEqual(['1. Cat', '2. Dog']);
  });

  test('the grid is still sent so options can be compared at a glance (R15)', () => {
    const msgs = render.build(picQ());
    expect(msgs.some((m) => m.role === 'option_grid')).toBe(true);
    expect(msgs.some((m) => m.kind === 'flow')).toBe(true);
  });
});
