/**
 * Discord Flow-equivalent registry — maps a Discord modal-workaround's `kind`
 * ('registration', 'settings', ...) to the renderer built for that endpoint.
 * Mirrors slack-flow-registry.js's register()/get()/ensureRegistered() shape
 * exactly; buildFlowToken() uses the same "userId:kind:timestamp" convention
 * (kept duplicated per this codebase's per-driver-file convention rather than
 * shared, matching how Slack/Baileys never share driver-adjacent code either).
 *
 * Lazily registered (first use, not at require time) to avoid a require cycle
 * through supabase / whatsapp.service — same rationale as
 * slack-flow-registry.js's own ensureRegistered().
 *
 * Exception: 'exam_confirm' does NOT use buildFlowToken() — its flow token is
 * the exam session's own session.id, unchanged, since the endpoint already
 * keys everything off that id. Callers triggering exam_confirm must pass the
 * session id directly as the flowToken, not call buildFlowToken() for it.
 */

const { buildEndpointModal } = require('../services/messaging/discord-modal-flow');
const discordChannel = require('../services/messaging/discord-channel.service');

const registry = new Map();

function register(kind, renderer) {
  registry.set(kind, renderer);
}

function get(kind) {
  return registry.get(kind);
}

function registerAll() {
  const registration = require('./registration-endpoint');
  const registrationView = require('./discord-views/registration.view');
  register('registration', buildEndpointModal({
    kind: 'registration',
    init: (ctx) => registration.handleRegistrationInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      registration.handleRegistrationDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    back: (ctx, screen) => registration.handleRegistrationBack(ctx.userId, screen, ctx.flowToken),
    screenToSteps: registrationView.screenToSteps,
    mergeScreenData: registrationView.mergeScreenData,
    onFinish: async (response, ctx) => {
      const { welcome_message: welcome, portal_message: portal } = response.data || {};
      const text = [welcome, portal].filter(Boolean).join('\n\n');
      if (text) await discordChannel.sendMessage(`discord:${ctx.discordUserId}`, text);
    },
  }));

  const settings = require('./settings-endpoint');
  const settingsView = require('./discord-views/settings.view');
  register('settings', buildEndpointModal({
    kind: 'settings',
    init: (ctx) => settings.handleSettingsInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      settings.handleSettingsDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    back: (ctx, screen) => settings.handleSettingsBack(ctx.userId, screen, ctx.flowToken),
    screenToSteps: settingsView.screenToSteps,
    mergeScreenData: settingsView.mergeScreenData,
    onFinish: async (response, ctx) => {
      const { confirmation_message: confirmation, details_message: details } = response.data || {};
      const text = [confirmation, details].filter(Boolean).join('\n');
      if (text) await discordChannel.sendMessage(`discord:${ctx.discordUserId}`, text);
    },
  }));

  // ADD_STUDENT loops back to itself after each student is added — the
  // generic runScreen()->showModal() auto-recursion is unsafe here (it would
  // reuse an already-acked modal-submit interaction, which Discord's
  // showModal() forbids). onScreenLoop sends a fresh "Add Another"/"I'm Done"
  // button message instead — a real button click gives the NEXT interaction
  // showModal() (Add Another) or exchange() (I'm Done) needs to directly ack.
  // See discord-modal-interactions.handler.js's own handling of these buttons.
  const attendance = require('./attendance-setup-endpoint');
  const attendanceView = require('./discord-views/attendance.view');
  register('attendance', buildEndpointModal({
    kind: 'attendance',
    init: (ctx) => attendance.handleSetupInit(ctx.userId),
    exchange: (ctx, screen, screenData) => attendance.handleSetupDataExchange(ctx.userId, screen, screenData),
    screenToSteps: attendanceView.screenToSteps,
    mergeScreenData: attendanceView.mergeScreenData,
    loopScreens: new Set(['ADD_STUDENT']),
    onScreenLoop: async (response, ctx) => {
      const { students_list: studentsList, class_info: classInfo } = response.data || {};
      const body = [classInfo, studentsList, 'Add another student?'].filter(Boolean).join('\n');
      await discordChannel.sendInteractiveButtons(`discord:${ctx.discordUserId}`, {
        body,
        buttons: [
          { id: `discord_attendance_add:${ctx.flowToken}`, title: 'Add Another' },
          { id: `discord_attendance_done:${ctx.flowToken}`, title: "I'm Done" },
        ],
      });
    },
    onFinish: async (response, ctx) => {
      const { success_message: success } = response.data || {};
      if (success) await discordChannel.sendMessage(`discord:${ctx.discordUserId}`, success);
    },
  }));

  // attendance_mark reuses the SAME endpoint Slack registers
  // (attendance-marking-endpoint.js is channel-agnostic — it only reads the
  // roster already sitting in AttendanceConversationService's Redis session,
  // keyed by userId, never anything Slack- or Discord-shaped). MARK_ABSENT
  // is a one-shot all-enum screen (zero textFields, see
  // discord-views/attendance-marking.view.js) so it never opens a Modal and
  // needs no loopScreens/onScreenLoop — straight to exchange() -> SUCCESS.
  const attendanceMarking = require('./attendance-marking-endpoint');
  const attendanceMarkingView = require('./discord-views/attendance-marking.view');
  register('attendance_mark', buildEndpointModal({
    kind: 'attendance_mark',
    init: (ctx) => attendanceMarking.handleMarkingInit(ctx.userId),
    exchange: (ctx, screen, screenData) => attendanceMarking.handleMarkingExchange(ctx.userId, screen, screenData),
    screenToSteps: attendanceMarkingView.screenToSteps,
    mergeScreenData: attendanceMarkingView.mergeScreenData,
    onFinish: async (response, ctx) => {
      const { success_message: success, selectedClass, selectedListId, records, stats, sessionDate, sessionType } = response.data || {};
      const recipientIdentifier = `discord:${ctx.discordUserId}`;
      if (success) await discordChannel.sendMessage(recipientIdentifier, success);

      const AttendanceDeliveryService = require('../services/attendance-delivery.service');
      const AttendanceConversationService = require('../services/attendance-conversation.service');

      try {
        const deliveryResult = await AttendanceDeliveryService.processAndDeliver(ctx.userId, recipientIdentifier, {
          selectedClass,
          selectedListId,
          records,
          markingMethod: 'tap',
          summary: {
            present: stats?.present,
            absent: stats?.absent,
            attendancePercentage: parseFloat(stats?.attendanceRate) || 0,
          },
          sessionDate,
          sessionType,
        });

        if (!deliveryResult.success && !deliveryResult.isDuplicate) {
          await discordChannel.sendMessage(recipientIdentifier, `Sorry, there was an error generating your attendance file: ${deliveryResult.error}`);
        }
      } finally {
        await AttendanceConversationService.clearSessionState(ctx.userId);
      }
    },
  }));

  // exam_confirm is the one kind whose flowToken IS the exam session's own
  // session.id (set by the orchestrator at sendFlow-time), never a
  // buildFlowToken() "userId:kind:timestamp" token — the endpoint keys
  // everything off that id directly, matching how the Meta flow already works.
  //
  // Unlike registration/settings/attendance, exam-confirm-endpoint.js's own
  // exchange() does NOT drive the workflow forward — it only returns the
  // selected student ids in extension_message_response, matching the Meta
  // Flow's NFM_REPLY shape. On Meta, flow-response.handler.js's
  // EXAM_CONFIRM_FLOW_ID branch is what actually feeds that payload into
  // ExamCheckerOrchestrator.process(), which drives confirm -> detect
  // questions -> grade. onFinish here replicates that exact hand-off for
  // Discord, looking the session back up by id to recover the userId/from
  // ExamCheckerOrchestrator.process() needs (ctx only carries the session id).
  const examConfirm = require('./exam-confirm-endpoint');
  const examConfirmView = require('./discord-views/exam-confirm.view');
  register('exam_confirm', buildEndpointModal({
    kind: 'exam_confirm',
    init: (ctx) => examConfirm.handleExamConfirmInit(ctx.flowToken),
    exchange: (ctx, screen, screenData) => examConfirm.handleExamConfirmDataExchange(ctx.flowToken, screen, screenData),
    back: (ctx) => examConfirm.handleExamConfirmBack(ctx.flowToken),
    screenToSteps: examConfirmView.screenToSteps,
    mergeScreenData: examConfirmView.mergeScreenData,
    onFinish: async (response, ctx) => {
      const confirmedStudents = response?.data?.extension_message_response?.params?.confirmed_students || [];
      const ExamSessionService = require('../services/exam-checker/exam-session.service');
      const { ExamCheckerOrchestrator } = require('../services/exam-checker/exam-checker.orchestrator');
      const session = await ExamSessionService.getById(ctx.flowToken);
      if (!session) return;
      await ExamCheckerOrchestrator.process(
        { type: 'flow', flowResponse: { confirmed_students: confirmedStudents } },
        session.user_id,
        session.recipient_identifier,
      );
    },
  }));

  // reading-assessment-endpoint.js's own exchange() does NOT create the
  // assessment record or generate a passage (see that file's header comment
  // for why) — onFinish here calls its startAssessment() directly, the same
  // extracted pipeline flow-response.handler.js's Meta NFM path now calls too,
  // so both channels share one implementation instead of duplicating it.
  const readingAssessment = require('./reading-assessment-endpoint');
  const readingAssessmentView = require('./discord-views/reading-assessment.view');
  register('reading_assessment', buildEndpointModal({
    kind: 'reading_assessment',
    init: (ctx) => readingAssessment.handleReadingAssessmentInit(ctx.userId),
    exchange: (ctx, screen, screenData) =>
      readingAssessment.handleReadingAssessmentDataExchange(ctx.userId, screen, screenData, ctx.flowToken),
    screenToSteps: readingAssessmentView.screenToSteps,
    mergeScreenData: readingAssessmentView.mergeScreenData,
    onFinish: async (response, ctx) => {
      const data = response.data || {};
      const isAutoMode = String(data.assessment_mode || '').includes('Auto');
      const language = String(data.Language || '').includes('Urdu') ? 'ur' : 'en';
      const levelMatch = String(data.select_the_reading_level || '').match(/^(\d+)_/);
      try {
        await readingAssessment.startAssessment(ctx.userId, `discord:${ctx.discordUserId}`, {
          studentName: data.student_full_name,
          language,
          isAutoMode,
          levelIndex: levelMatch ? levelMatch[1] : '0',
          comprehensionRequired: String(data.scope_of_assessment_ || '').includes('Comprehension'),
        });
      } catch (error) {
        const { logToFile } = require('../utils/logger');
        logToFile('❌ Discord reading-assessment: startAssessment failed', { error: error.message, stack: error.stack });
        await discordChannel.sendMessage(`discord:${ctx.discordUserId}`, 'Sorry, something went wrong setting up the reading assessment. Please try again.');
      }
    },
  }));
}

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registerAll();
  registered = true;
}

/** Test-only: forces registerAll() to run again on the next ensureRegistered() call. */
function _resetForTests() {
  registered = false;
  registry.clear();
}

/** Builds a fresh flow-token in this codebase's existing "userId:kind:timestamp" convention. */
function buildFlowToken(userId, kind) {
  return `${userId}:${kind}:${Date.now()}`;
}

module.exports = { register, get, ensureRegistered, buildFlowToken, _resetForTests };
