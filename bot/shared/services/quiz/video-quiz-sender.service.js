'use strict';
/**
 * execute the render contract against the WhatsApp API.
 *
 * VideoQuizRenderService decides WHAT is sent and in what order. This file is
 * the only place that turns those instructions into API calls. Keeping them
 * apart is what makes the ordering testable without a phone, and what let the
 * Python/JS parity check prove the shipped sequence is the one QA judged.
 *
 * Three things here are load-bearing, each verified against
 * whatsapp.service.js rather than assumed:
 *
 *  - ANCHORING (R4). An option label is a quoted reply to the clip it names.
 *    The ordinary send helpers return booleans, so this uses the two
 *    *ReturningId variants — you cannot quote a message whose id you threw away.
 *  - IMAGE + BUTTONS. sendInteractiveButtons ignores any header, so a picture
 *    question with <=3 options must go through sendImageWithButtons. Passing a
 *    headerImage to the former would have silently dropped the picture.
 *  - PACING. Messages are spaced. WhatsApp does not guarantee ordering for
 *    rapid-fire sends, and an out-of-order stimulus clip is the R18 bug again,
 *    this time caused by the wire rather than the data.
 */

const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const render = require('./video-quiz-render.service');

// Enough for WhatsApp to preserve order without making a child wait.
const GAP_TEXT_MS = 700;
const GAP_MEDIA_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build list rows that a child can actually read.
 *
 * Meta caps a row TITLE at 24 characters and truncates SILENTLY — the operator
 * received "5 red pencils and 10 blu" and "23 blue pencils, and 19" as things
 * to choose between. Rows also carry a DESCRIPTION (72 chars) which we were not
 * using at all, so the fix is to put the option there whenever the title cannot
 * hold it. Anything longer than 72 is spelled out in the message body by
 * render.askBody(), so no option is ever unreadable on every surface at once.
 */
function listRows(options, ctx) {
  return options.slice(0, 10).map((title, i) => {
    const row = {
      id: render.answerId(ctx.questionId, i),
      title: title.slice(0, render.LIST_ROW_TITLE_MAX),
    };
    if (title.length > render.LIST_ROW_TITLE_MAX) {
      row.description = title.slice(0, render.LIST_ROW_DESCRIPTION_MAX);
    }
    return row;
  });
}

/**
 * Send one phase of a question.
 *
 * @param {string} phone
 * @param {Array}  msgs   output of render.build()
 * @param {string} phase  'question' | 'interaction' | 'answer'
 * @param {Object} ctx    { questionId, sessionId, flowId, isCorrect, selectedIndex }
 * @returns {Promise<{sent:number, failed:number}>}
 */
async function sendPhase(phone, msgs, phase, ctx = {}) {
  let sent = 0;
  let failed = 0;
  let lastMessageId = null;

  for (const m of msgs.filter((x) => x.phase === phase)) {
    // The ANSWER phase carries the correct branch plus one branch per wrong
    // option. Send only the branch matching what the child actually picked.
    if (phase === 'answer') {
      if (m.role === 'feedback_correct' && !ctx.isCorrect) continue;
      if (m.role === 'feedback_incorrect') {
        if (ctx.isCorrect) continue;
        if (m.optionIndex !== undefined && m.optionIndex !== ctx.selectedIndex) continue;
      }
    }

    let ok = false;
    try {
      switch (m.kind) {
        case 'text': {
          if (m.anchoredToPrevious && lastMessageId) {
            const id = await WhatsAppService.sendTextReturningId(
              phone, m.body, { contextMessageId: lastMessageId }
            );
            ok = !!id;
          } else {
            ok = await WhatsAppService.sendMessage(phone, m.body);
          }
          break;
        }
        case 'audio': {
          // Option clips need an id so their label can quote them; other clips
          // do not, but one code path is cheaper to reason about than two.
          const id = await WhatsAppService.sendAudioFromUrlReturningId(phone, m.url);
          if (id) lastMessageId = id;
          ok = !!id;
          break;
        }
        case 'image':
          ok = await WhatsAppService.sendImageFromUrl(phone, m.url, m.caption || '');
          break;
        case 'buttons':
          ok = await sendButtons(phone, m, ctx);
          break;
        case 'list':
          ok = await WhatsAppService.sendInteractiveMessage(phone, {
            body: { text: m.body },
            action: {
              button: 'Choose answer',
              sections: [{ title: 'Options', rows: listRows(m.options, ctx) }],
            },
          });
          break;
        case 'flow':
          ok = await sendPictureFlow(phone, m, ctx);
          break;
        default:
          logToFile('⚠️ video-quiz: unknown message kind', { kind: m.kind });
      }
    } catch (err) {
      logToFile('❌ video-quiz send threw', {
        phone: phone.slice(-4), role: m.role, kind: m.kind, error: err.message,
      });
      ok = false;
    }

    if (ok) {
      sent += 1;
    } else {
      failed += 1;
      logToFile('⚠️ video-quiz message not delivered', {
        phone: phone.slice(-4), role: m.role, kind: m.kind,
      });
      // A dropped clip degrades the question; a dropped PICKER strands the
      // child with nothing to tap. Only the latter aborts the phase.
      if (m.role === 'ask' || m.role === 'picture_flow') {
        return { sent, failed, pickerFailed: true };
      }
    }
    await sleep(m.kind === 'text' ? GAP_TEXT_MS : GAP_MEDIA_MS);
  }
  return { sent, failed, pickerFailed: false };
}

/**
 * <=3 options. sendInteractiveButtons has NO header support, so a question
 * image has to go through sendImageWithButtons instead — verified in
 * whatsapp.service.js, not assumed from the Meta docs.
 */
async function sendButtons(phone, m, ctx) {
  const buttons = m.options.slice(0, 3).map((title, i) => ({
    id: render.answerId(ctx.questionId, i),
    title: title.slice(0, render.BUTTON_TITLE_MAX),
  }));
  if (m.headerImage) {
    return WhatsAppService.sendImageWithButtons(phone, m.headerImage, m.body, buttons);
  }
  return WhatsAppService.sendInteractiveButtons(phone, { body: m.body, buttons });
}

/**
 * R8/R15 — picture options as tappable pictures inside a Flow.
 *
 * Uses the navigate hybrid: `navigateData` + `screen` pre-fills the option images
 * on the first screen while the Flow's own data_api_version keeps the submit on
 * data_exchange, so the tap comes back to us for grading.
 *
 * Falls back to the numbered picker whenever the Flow cannot be built — a child
 * must never be left looking at a grid with nothing to tap.
 */
async function sendPictureFlow(phone, m, ctx) {
  const flowId = ctx.flowId || process.env.VIDEO_QUIZ_FLOW_ID;
  const images = m.optionImages || [];
  // EVERY option must carry an image. A Flow with some pictures missing is
  // worse than the numbered picker: the child compares a photo against a blank.
  const complete = images.length === (m.options || []).length && images.every(Boolean);
  if (flowId && complete) {
    const ok = await WhatsAppService.sendFlow(phone, {
      flowId,
      buttonText: 'Tap the picture',
      body: m.body,
      screen: 'ASK',
      flowToken: `vq:${ctx.sessionId || 'none'}:${ctx.questionId}`,
      navigateData: {
        question: m.body,
        options: m.options.map((title, i) => ({
          id: String(i), title, image: images[i] || '', 'alt-text': title,
        })),
      },
    });
    if (ok) return true;
    logToFile('⚠️ picture Flow failed — falling back to numbered picker', {
      phone: phone.slice(-4), questionId: ctx.questionId,
    });
  }
  return WhatsAppService.sendInteractiveMessage(phone, {
    body: { text: 'Which picture is right?' },
    action: {
      button: 'Choose answer',
      sections: [{ title: 'Options', rows: listRows(m.options, ctx) }],
    },
  });
}

module.exports = { sendPhase, GAP_TEXT_MS, GAP_MEDIA_MS };
