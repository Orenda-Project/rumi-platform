/**
 * The text stand-ins for this deployment's WhatsApp Flows.
 *
 * Registered once, at startup, by whatsapp-bot.js — but ONLY when the selected
 * channel driver cannot render a real Flow (see registerTextFlowsIfNeeded).
 * On Meta nothing here is ever reached: the native Flow is strictly better UX
 * and is what production users get.
 *
 * Two shapes appear below:
 *
 *  1. Endpoint-backed (student-videos, settings) — declared against the very
 *     same bot/shared/routes/*-endpoint.js functions the Meta Flow calls, via
 *     endpoint-text-flow.js. No business logic is duplicated.
 *
 *  2. Navigate-style (reading-assessment) — a Flow with no endpoint, whose
 *     submission arrives as one `nfm_reply` webhook. Here the text flow
 *     collects the same fields and then synthesises that exact webhook shape,
 *     so bot/whatsapp-bot.js's existing nfm_reply dispatch and
 *     flow-response.handler.js run completely unchanged. The field NAMES below
 *     are therefore a contract with flow-response.handler.js and
 *     utils/flow-type-detector.js — see the tests that pin them.
 *
 * @module text-flow-definitions
 */

const { logToFile } = require('../../utils/logger');
const textFlow = require('./text-flow');
const { buildEndpointFlow } = require('./endpoint-text-flow');

/** Turns collected answers into the `nfm_reply` a navigate-style Flow submits. */
function toNfmReply(name, responseJson) {
  return {
    type: 'interactive',
    interactive: {
      type: 'nfm_reply',
      nfm_reply: {
        name,
        body: 'Sent',
        response_json: JSON.stringify(responseJson),
      },
    },
  };
}

// ── student-videos: the pre-made curriculum video library ────────────────────
// SELECT_GRADE -> SELECT_SUBJECT -> SELECT_TOPIC (which sends the video).
function studentVideosFlow() {
  // eslint-disable-next-line global-require -- endpoint modules pull in supabase; load on use
  const endpoint = require('../../routes/student-videos-endpoint');
  return buildEndpointFlow({
    kind: 'student-videos',
    init: (ctx) => endpoint.handleStudentVideosInit(ctx.flowToken),
    exchange: (ctx, screen, screenData) =>
      endpoint.handleStudentVideosDataExchange(ctx.flowToken, screen, screenData),
    fallbackError: 'The video library is not available right now. Please try again later.',
    stages: [
      {
        screen: 'SELECT_GRADE',
        fields: [{
          id: 'grade',
          optionsKey: 'grades',
          prompt: () => ({ header: '🎬 Student Videos', body: 'Which class are you teaching?' }),
        }],
      },
      {
        screen: 'SELECT_SUBJECT',
        fields: [{
          id: 'subject',
          optionsKey: 'subjects',
          prompt: (answers) => ({ body: `Which subject for ${answers.grade.title}?` }),
        }],
      },
      {
        screen: 'SELECT_TOPIC',
        fields: [{
          id: 'video',
          optionsKey: 'videos',
          prompt: (answers, context) => ({
            header: context.response?.data?.header_text || 'Pick a video',
            body: 'Which video would you like?',
          }),
        }],
      },
    ],
    // The endpoint already sends its own "Sending your video…" ack, so adding a
    // second confirmation here would double-message the teacher.
    onFinish: () => null,
  });
}

// ── settings: language + observation framework ───────────────────────────────
// One Flow screen with two dropdowns becomes two questions.
function settingsFlow() {
  // eslint-disable-next-line global-require -- see above
  const endpoint = require('../../routes/settings-endpoint');
  return buildEndpointFlow({
    kind: 'settings',
    init: (ctx) => endpoint.handleSettingsInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      endpoint.handleSettingsDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    fallbackError: 'Settings could not be opened right now. Please try again later.',
    stages: [
      {
        screen: 'SETTINGS_MAIN',
        fields: [
          {
            id: 'language',
            optionsKey: 'languages',
            prompt: () => ({
              header: '⚙️ Rumi Settings',
              body: 'Which language should I reply in?',
            }),
          },
          {
            id: 'observation_framework',
            optionsKey: 'frameworks',
            prompt: (answers, context) => ({
              body: 'Which classroom-observation framework should I coach against?',
              footer: context.response?.data?.info_text || undefined,
            }),
          },
        ],
      },
    ],
    onFinish: (response) => {
      const data = response?.data || {};
      return [data.confirmation_message, data.details_message].filter(Boolean).join('\n') || null;
    },
  });
}

// ── reading-assessment: navigate-style, submitted as one nfm_reply ───────────
// Field names are the Flow v2 names flow-response.handler.js reads, and the
// "index_Label" value format it parses (it splits on "_" and matches on the
// label), so the synthesised submission is indistinguishable from a real one.
const READING_LANGUAGES = [
  { id: '0_English', title: 'English' },
  { id: '1_Urdu', title: 'Urdu' },
];

const READING_MODES = [
  { id: '0_Auto', title: 'Automatic', description: 'Rumi finds the right level as you go' },
  { id: '1_Manual', title: 'Choose the level myself', description: '' },
];

const READING_LEVELS = [
  { id: '0_Letters', title: 'Letters', description: 'Kindergarten' },
  { id: '1_Words', title: 'Words', description: 'Grade 1' },
  { id: '2_Sentences', title: 'Sentences', description: 'Grade 1-2' },
  { id: '3_Paragraph', title: 'Paragraph', description: 'Grade 3-5' },
];

const READING_SCOPES = [
  { id: '0_Fluency_Only', title: 'Fluency only', description: 'Speed and accuracy' },
  { id: '1_Fluency_+_Comprehension', title: 'Fluency + Comprehension', description: 'Adds questions' },
];

function isManualMode(answers) {
  return answers.Assessment_Mode?.id === '1_Manual';
}

function readingAssessmentFlow() {
  return {
    kind: 'reading-assessment',
    steps: [
      {
        id: 'Student_Full_Name',
        freeText: true,
        prompt: () => ({
          header: '📚 Reading Assessment',
          body: "What is the student's full name?",
        }),
      },
      {
        id: 'Language',
        options: () => READING_LANGUAGES,
        prompt: () => ({ body: 'Which language will they read in?' }),
      },
      {
        id: 'Assessment_Mode',
        options: () => READING_MODES,
        prompt: () => ({ body: 'How should the reading level be set?' }),
      },
      {
        id: 'Select_the_reading_level',
        // Skipped entirely in automatic mode — the handler starts at story
        // level and adapts, so asking would be a question with no effect.
        when: isManualMode,
        options: () => READING_LEVELS,
        prompt: () => ({ body: 'Which level should they start at?' }),
      },
      {
        id: 'Scope_of_Assessment_',
        options: () => READING_SCOPES,
        prompt: () => ({ body: 'What should I assess?' }),
      },
    ],
    async onComplete(phone, answers, context) {
      const userId = context?._ctx?.userId || 'anon';
      const responseJson = { flow_token: `${userId}:reading:${phone}` };
      for (const [field, answer] of Object.entries(answers)) {
        if (field.startsWith('_')) continue;
        responseJson[field] = answer.id;
      }
      // Manual mode requires a level; automatic mode is levelled by the
      // handler itself, but the field must still be present and parseable.
      if (!responseJson.Select_the_reading_level) {
        responseJson.Select_the_reading_level = '3_Paragraph';
      }
      return { metaMessage: toNfmReply('reading_assessment', responseJson) };
    },
  };
}

// ── class-setup: the class + roster a teacher needs before /quiz or attendance ─
//
// The Meta Flow for this (docs/flows/attendance-setup-flow.json) is an
// endpoint-driven LOOP — one screen per student, "Add & Continue" repeatedly —
// which is a poor fit for chat and for endpoint-text-flow.js's linear stages.
// But attendance also has a NAVIGATE format, handled by
// attendance-flow.handler.js#parseSetupFlowResponse: { class_name, section,
// attendance_frequency, student_list }, where student_list is free text parsed
// one-student-per-line by StudentListService.parseStudentText. In chat that is
// strictly nicer than the loop — the teacher pastes the roster once — so this
// synthesises that submission instead.
const ATTENDANCE_FREQUENCIES = [
  { id: 'once', title: 'Once per day' },
  { id: 'twice', title: 'Twice (morning & afternoon)' },
];

function classSetupFlow() {
  return {
    kind: 'class-setup',
    steps: [
      {
        id: 'class_name',
        freeText: true,
        prompt: () => ({
          header: '📋 Class Setup',
          body: 'Which grade is this class?\n\nFor example: 4, 5, KG-II, Nursery',
        }),
      },
      {
        id: 'section',
        freeText: true,
        prompt: () => ({
          body: 'Any section? For example: A, B, Blue, Morning.\n\nReply *none* if the class has no section.',
        }),
      },
      {
        id: 'attendance_frequency',
        options: () => ATTENDANCE_FREQUENCIES,
        prompt: () => ({ body: 'How often do you take attendance?' }),
      },
      {
        id: 'student_list',
        freeText: true,
        prompt: () => ({
          // The phone number is optional but prompted for, because without it
          // the class cannot receive quizzes or reports — and the teacher only
          // discovers that later, at the class picker.
          body: 'Now send me your students — *one per line*.\n\n'
            + "Add the parent's WhatsApp number if you have it, so I can send "
            + 'quizzes and reports to them.\n\nFor example:\n'
            + 'Ahmed Khan +923001234567\nZara s/o Abdul 03007654321\nBilal Hussain',
        }),
      },
    ],
    async onComplete(phone, answers) {
      const section = answers.section?.title?.trim() || '';
      const responseJson = {
        class_name: answers.class_name.title.trim(),
        // "none" is the documented escape for a class without a section; the
        // handler treats an empty section as absent.
        section: /^(none|no|-)$/i.test(section) ? '' : section,
        attendance_frequency: answers.attendance_frequency.id,
        student_list: answers.student_list.title,
      };
      return { metaMessage: toNfmReply('attendance_setup', responseJson) };
    },
  };
}

const BUILDERS = [studentVideosFlow, settingsFlow, readingAssessmentFlow, classSetupFlow];

/**
 * Registers every text flow. Idempotent (register() overwrites by kind), and
 * lazy about requiring endpoint modules so a deployment missing one feature's
 * dependencies doesn't fail startup for all of them.
 */
function registerAll() {
  const registered = [];
  for (const build of BUILDERS) {
    try {
      const definition = build();
      textFlow.register(definition);
      registered.push(definition.kind);
    } catch (error) {
      logToFile('❌ text-flow-definitions: a flow failed to register', { error: error.message });
    }
  }
  return registered;
}

let hasRegistered = false;

/**
 * Registers on first use rather than at require time — deliberately.
 *
 * The endpoint modules require services/whatsapp.service, which resolves to
 * messaging/index.js, which requires the driver that calls this. Registering at
 * module load would therefore close a require cycle and hand out a
 * half-initialised driver. Doing it on the first sendFlow()/advance() call also
 * means any process that sends a Flow (the bot, a worker) is covered without
 * each entry point having to remember to wire it up.
 */
function ensureRegistered() {
  if (hasRegistered) return;
  const kinds = registerAll();
  hasRegistered = kinds.length > 0;
  if (hasRegistered) logToFile('✅ Text flows registered', { kinds });
}

/** Test-only. */
function _resetForTests() {
  hasRegistered = false;
}

module.exports = {
  registerAll,
  ensureRegistered,
  _resetForTests,
  toNfmReply,
  ATTENDANCE_FREQUENCIES,
  READING_LANGUAGES,
  READING_MODES,
  READING_LEVELS,
  READING_SCOPES,
};
