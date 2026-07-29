'use strict';
/**
 * ..2316 — share a video quiz with a class, and record what they score.
 *
 * WHY A LINK AND NOT THE QUESTIONS THEMSELVES
 * The obvious design — the teacher forwards the quiz messages into her class
 * WhatsApp group — cannot work, and the reason is platform law, not our gap:
 *   1. Forwarding STRIPS interactivity. A forwarded button/list/Flow arrives as
 *      dead text; taps never reach our webhook, so nothing can be recorded.
 *   2. The bot cannot sit in an ordinary group. The Groups API caps membership
 *      at 8 and prohibits interactive messages even there.
 * What forwards perfectly is a LINK. So the teacher forwards ONE message
 * carrying a wa.me link with a code; each child taps it, lands in their own 1:1
 * chat with Rumi, gives a name and class, and takes the full quiz — media,
 * feedback and all — with every answer stored and attributed to her.
 *
 * A child arriving this way sees who sent it and what it is about before
 * anything else: "Your teacher <name> sent you a quiz on <topic>."
 */

const supabase = require('../../config/supabase');
const redisService = require('../cache/railway-redis.service');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const StudentIdentity = require('./student-identity.service');

const JOIN_TTL_SECS = 60 * 60;
const stripPlus = (p) => (p && p.startsWith('+') ? p.slice(1) : p);
const JOIN_KEY = (phone) => `videoquiz:${stripPlus(phone)}:join`;

const SHARE_YES = 'vq_share_yes';
const SHARE_NO = 'vq_share_no';
// the flow token that marks a name-and-class submission as ours.
const JOIN_FLOW_PREFIX = 'vqjoin:';

// Unambiguous alphabet: no O/0, I/1, S/5 — a child may retype this by hand off
// a relative's screen, and a misread character means a dead link.
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
const CODE_RX = /\bQUIZ-([A-Z0-9]{6})\b/i;

function randomCode() {
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

function botNumber() {
  // The number a child's wa.me link must open. PHONE_NUMBER_ID is Meta's
  // internal id, not a dialable number, so it cannot be used here.
  //
  // WHATSAPP_BOT_NUMBER (preferred) or REFERRAL_BOT_NUMBER must hold this
  // deployment's dialable number in digits (e.g. 9230XXXXXXXX). There is
  // deliberately NO fallback: a wrong number here silently sends a class of
  // children to somebody else's bot, and is invisible until a child taps it.
  const n = process.env.WHATSAPP_BOT_NUMBER || process.env.REFERRAL_BOT_NUMBER;
  if (!n) {
    logToFile('⚠️ share: WHATSAPP_BOT_NUMBER not configured — share links disabled', {});
    return '';
  }
  return String(n).replace(/\D/g, '');
}

// ─── Minting ────────────────────────────────────────────────────────────────

async function mintCode({ quizId, userId, videoId, language = 'en' }) {
  const { data: user } = await supabase
    .from('users').select('first_name, last_name').eq('id', userId).maybeSingle();
  const teacherName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || 'your teacher';
  const { data: quiz } = await supabase
    .from('quizzes').select('topic').eq('id', quizId).maybeSingle();

  // Retry on the unique-code collision rather than trusting one draw.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const { data, error } = await supabase.from('quiz_share_codes').insert({
      code, quiz_id: quizId, teacher_user_id: userId, video_id: videoId,
      teacher_name: teacherName, topic: quiz?.topic || null, language,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('id, code').single();
    if (!error && data) return { ...data, teacherName, topic: quiz?.topic };
    if (error && error.code !== '23505') {
      logToFile('❌ share: could not mint code', { error: error.message });
      return null;
    }
  }
  return null;
}

/** After a solo run, offer to send it to the class. */
async function offerShare({ phone, userId, quizId, videoId, language = 'en' }) {
  await redisService.set(`videoquiz:${stripPlus(phone)}:share`, {
    quizId, videoId, userId, language,
  }, JOIN_TTL_SECS);
  await WhatsAppService.sendInteractiveButtons(phone, {
    body: 'Want to send this quiz to your class?\n\n'
      + "I'll give you one message to forward. Each child gets the quiz in their "
      + "own chat, and you'll get their results in the morning.",
    buttons: [
      { id: SHARE_YES, title: 'Share with class' },
      { id: SHARE_NO, title: 'Not now' },
    ],
  });
}

async function handleShareButton(buttonId, phone) {
  if (buttonId !== SHARE_YES && buttonId !== SHARE_NO) return false;
  const key = `videoquiz:${stripPlus(phone)}:share`;
  const ctx = await redisService.get(key);
  await redisService.delete(key);
  if (buttonId === SHARE_NO || !ctx) {
    if (buttonId === SHARE_NO) {
      await WhatsAppService.sendMessage(phone, 'No problem — it will be here when you want it.');
    }
    return true;
  }

  return module.exports.deliverClassLink(ctx, phone);
}

/**
 * Mint a code and hand the teacher the message she forwards.
 *
 * extracted so BOTH entry points share one implementation: the
 * post-solo-run offer, and the "send to my class" choice she can now make at
 * the quiz offer itself without taking the quiz first. Two copies of this would
 * drift, and the copy she sees is the copy thirty children read.
 */
async function deliverClassLink(ctx, phone) {
  if (!botNumber()) {
    await WhatsAppService.sendMessage(phone,
      "Sorry — class links aren't set up on this deployment yet.");
    return true;
  }
  const minted = await mintCode(ctx);
  if (!minted) {
    await WhatsAppService.sendMessage(phone,
      "Sorry — I couldn't create the class link just now. Try again in a moment.");
    return true;
  }

  const link = `https://wa.me/${botNumber()}?text=QUIZ-${minted.code}`;
  await WhatsAppService.sendMessage(phone,
    'Here is your class message — forward THIS one to your class group:');
  // Sent as its own message so forwarding it carries nothing else.
  await WhatsAppService.sendMessage(phone,
    `📚 *Quiz time!*\n\n${minted.teacherName} has sent you a quiz on `
    + `*${minted.topic || 'today’s video'}*.\n\n`
    + `Tap here to start:\n${link}\n\n`
    + `It takes about 10 minutes. You'll need to type your name and class first.`);
  await WhatsAppService.sendMessage(phone,
    `You'll get a report on how your class did tomorrow morning, or as soon as `
    + `everyone has finished.`);

  logEvent('video_quiz.share_code_minted', {
    userId: ctx.userId, quizId: ctx.quizId, code: minted.code,
  });
  return true;
}

// ─── The child's side ───────────────────────────────────────────────────────

/** Does this inbound text carry a share code? */
function parseShareCode(text) {
  const m = CODE_RX.exec(text || '');
  return m ? m[1].toUpperCase() : null;
}

/**
 * A child tapped the link. Greet them by naming the teacher and the topic —
 * they may have no idea what this message is — then collect name and class
 * BEFORE question 1, so the teacher's report has someone to name.
 */
async function beginFromCode(phone, code) {
  // Region gate — same gate as the offer. A share link minted before the flag
  // was turned off should not keep admitting children.
  const { isVideoQuizzesEnabled } = require('../region-features.service');
  const { detectRegion } = require('../../utils/region');
  if (!(await isVideoQuizzesEnabled(detectRegion()))) return false;

  // this may be a teacher's code OR a child's invite. resolveInvite
  // collapses both to "which teacher code does this belong to, and who sent
  // them" — so everything downstream, including the class report, is unchanged.
  const Invite = require('./video-quiz-invite.service');
  const sc = await Invite.resolveInvite(code);

  if (!sc || !sc.active || (sc.expires_at && new Date(sc.expires_at) < new Date())) {
    await WhatsAppService.sendMessage(phone,
      "That quiz link has expired. Ask your teacher for a new one!");
    return true;
  }

  const ctx = {
    // The PARENT code when this was an invite — the child counts toward the
    // teacher's report exactly like anyone she sent it to directly.
    shareCodeId: sc.shareCodeId,
    quizId: sc.quiz_id, videoId: sc.video_id,
    language: sc.language || 'en', topic: sc.topic, teacherName: sc.teacher_name,
    invitedByStudentId: sc.invitedByStudentId,
    // whose quiz this is, so a new child is filed under her.
    teacherUserId: sc.teacher_user_id || null,
  };

  const greeting = `👋 Assalam o Alaikum!\n\n*${sc.teacher_name || 'Your teacher'}* `
    + `has sent you a quiz on *${sc.topic || 'today’s lesson'}*.`;

  // do we already know who is on this handset?
  const known = await StudentIdentity.findByPhone(phone);

  if (known.length === 1) {
    // Straight in. A child who told us their name last week should not be asked
    // again just because their teacher shared a new quiz.
    const s = known[0];
    await redisService.delete(JOIN_KEY(phone));
    await WhatsAppService.sendMessage(phone,
      `${greeting}\n\nGood to see you again, ${s.student_name} — let's begin!`);
    await startForStudent(phone, ctx, s);
    logEvent('video_quiz.share_code_opened', {
      code, quizId: sc.quiz_id, recognised: true,
    });
    return true;
  }

  if (known.length > 1) {
    // Siblings share a handset. Ask — never assume the first one, or a child's
    // score is filed under their brother's name and nobody can tell.
    await redisService.set(JOIN_KEY(phone), {
      ...ctx, step: 'whoami', candidates: known.map((s) => ({
        id: s.id, name: s.student_name, className: s.self_reported_class,
      })),
    }, JOIN_TTL_SECS);
    const names = known.map((s, i) => `${i + 1}. ${s.student_name}`).join('\n');
    await WhatsAppService.sendMessage(phone,
      `${greeting}\n\nWho is taking it today?\n\n${names}\n${known.length + 1}. Someone else`
      + `\n\nReply with the number.`);
    logEvent('video_quiz.share_code_opened', {
      code, quizId: sc.quiz_id, recognised: true, siblings: known.length,
    });
    return true;
  }

  // a child we have never met. One Flow screen collects name and
  // class together, instead of three round trips before question 1.
  await redisService.set(JOIN_KEY(phone), { ...ctx, step: 'name' }, JOIN_TTL_SECS);

  const joinFlowId = process.env.STUDENT_JOIN_FLOW_ID;
  if (joinFlowId) {
    const sent = await WhatsAppService.sendFlow(phone, {
      flowId: joinFlowId,
      buttonText: 'Start',
      body: greeting,
      screen: 'WHO',
      // Routed on OUR token, never inferred from the payload shape — a generic
      // {student_name, student_class} body is exactly what another form would
      // also send.
      flowToken: `${JOIN_FLOW_PREFIX}${sc.id}`,
      navigateData: {
        teacher: sc.teacher_name || 'Your teacher',
        topic: sc.topic || 'today’s lesson',
      },
    });
    if (sent) {
      logEvent('video_quiz.share_code_opened', {
        code, quizId: sc.quiz_id, recognised: false, via: 'flow',
      });
      return true;
    }
    logToFile('⚠️ student join Flow failed — asking in chat instead', { code });
  }

  // No Flow configured, or it failed to send. Asking in chat is slower but a
  // child must never reach a dead end because a Meta asset is missing.
  await WhatsAppService.sendMessage(phone, `${greeting}\n\nFirst — what is your name?`);
  logEvent('video_quiz.share_code_opened', {
    code, quizId: sc.quiz_id, recognised: false, via: 'chat',
  });
  return true;
}

/**
 * a child submitted the name-and-class Flow.
 *
 * Returns false when the token is not ours, so the caller keeps routing. The
 * submission arrives via nfm_reply, which only fires because the Flow footer is
 * `complete`; a data_exchange footer would render the same screen and deliver
 * nothing here.
 */
async function handleJoinFlowReply(phone, flowToken, payload = {}) {
  if (typeof flowToken !== 'string' || !flowToken.startsWith(JOIN_FLOW_PREFIX)) {
    return false;
  }
  const shareCodeId = flowToken.slice(JOIN_FLOW_PREFIX.length);
  const name = String(payload.student_name || '').trim();
  const className = String(payload.student_class || '').trim();

  if (!name) {
    // Ours, so we consume it — but there is nothing to store. Ask rather than
    // writing a blank child into the teacher's report.
    await WhatsAppService.sendMessage(phone,
      "I didn't catch your name — what should I call you?");
    await redisService.set(JOIN_KEY(phone), { shareCodeId, step: 'name' }, JOIN_TTL_SECS);
    return true;
  }

  const { data: sc } = await supabase
    .from('quiz_share_codes')
    // teacher_user_id is load-bearing : without it the Flow join path
    // files the child under nobody, and only the chat fallback would work.
    .select('id, quiz_id, video_id, teacher_user_id, teacher_name, topic, language')
    .eq('id', shareCodeId)
    .maybeSingle();
  if (!sc) {
    await WhatsAppService.sendMessage(phone,
      'That quiz link has expired. Ask your teacher for a new one!');
    return true;
  }

  await redisService.delete(JOIN_KEY(phone));
  const student = await StudentIdentity.remember({
    phone, name, className, enrolledByUserId: sc.teacher_user_id || null,
  });

  await WhatsAppService.sendMessage(phone,
    `Great — ${name}${className ? `, ${className}` : ''}. Let's begin!`);

  await startForStudent(phone, {
    shareCodeId: sc.id, quizId: sc.quiz_id, videoId: sc.video_id,
    language: sc.language || 'en',
  }, {
    id: student?.id || null, student_name: name, self_reported_class: className,
  });

  logEvent('video_quiz.join_flow_completed', {
    shareCodeId: sc.id, quizId: sc.quiz_id, studentId: student?.id || null,
  });
  return true;
}

/** Begin the quiz for a child we can name, linking the session to them. */
async function startForStudent(phone, ctx, student) {
  const VideoQuizService = require('./video-quiz.service');
  await VideoQuizService.startSession({
    phone, userId: null, quizId: ctx.quizId, videoId: ctx.videoId,
    language: ctx.language, source: 'share_link',
    studentName: student.student_name || student.name,
    studentClass: student.self_reported_class || student.className,
    studentId: student.id,
    shareCodeId: ctx.shareCodeId,
    invitedByStudentId: ctx.invitedByStudentId || null,
  });
  const report = require('./video-quiz-report.service');
  await report.scheduleForShareCode(ctx.shareCodeId)
    .catch(() => { /* scheduling is best-effort; the quiz still runs */ });
}

/**
 * Consume the next inbound text as name, then class. Returns true when the
 * message was consumed by this flow so the caller stops routing it.
 */
async function consumeJoinReply(phone, text) {
  const st = await redisService.get(JOIN_KEY(phone));
  if (!st) return false;
  const value = (text || '').trim();
  if (!value) return false;

  // siblings on one handset picked which of them is playing.
  if (st.step === 'whoami') {
    const pick = parseInt(value, 10);
    const list = st.candidates || [];
    if (!Number.isInteger(pick) || pick < 1 || pick > list.length + 1) {
      await WhatsAppService.sendMessage(phone,
        `Please reply with just the number — 1 to ${list.length + 1}.`);
      return true;
    }
    if (pick === list.length + 1) {
      // "Someone else" — a child we have not met. Fall through to asking.
      st.step = 'name';
      delete st.candidates;
      await redisService.set(JOIN_KEY(phone), st, JOIN_TTL_SECS);
      await WhatsAppService.sendMessage(phone, 'No problem — what is your name?');
      return true;
    }
    const chosen = list[pick - 1];
    await redisService.delete(JOIN_KEY(phone));
    await WhatsAppService.sendMessage(phone, `Let's begin, ${chosen.name}!`);
    await StudentIdentity.touch(chosen.id);
    await startForStudent(phone, st, {
      id: chosen.id, student_name: chosen.name, self_reported_class: chosen.className,
    });
    return true;
  }

  if (st.step === 'name') {
    st.studentName = value.slice(0, 60);
    st.step = 'class';
    await redisService.set(JOIN_KEY(phone), st, JOIN_TTL_SECS);
    await WhatsAppService.sendMessage(phone,
      `Thanks ${st.studentName}! And which class are you in? (for example: Grade 4)`);
    return true;
  }

  if (st.step === 'class') {
    st.studentClass = value.slice(0, 40);
    await redisService.delete(JOIN_KEY(phone));
    await WhatsAppService.sendMessage(phone,
      `Great — ${st.studentName}, ${st.studentClass}. Let's begin!`);

    // remember them, so the next quiz their teacher shares opens
    // straight at question 1. Best-effort: if this fails the quiz still runs,
    // they are just asked again next time (the old behaviour).
    const student = await StudentIdentity.remember({
      phone, name: st.studentName, className: st.studentClass,
      enrolledByUserId: st.teacherUserId || null,
    });

    const VideoQuizService = require('./video-quiz.service');
    await VideoQuizService.startSession({
      phone, userId: null, quizId: st.quizId, videoId: st.videoId,
      language: st.language, source: 'share_link',
      studentName: st.studentName, studentClass: st.studentClass,
      studentId: student?.id || null,
      shareCodeId: st.shareCodeId,
      invitedByStudentId: st.invitedByStudentId || null,
    });
    // schedule the teacher's morning report the first time anyone
    // joins. Idempotent on the SQS deduplication id, so later joiners do not
    // queue a second one.
    const report = require('./video-quiz-report.service');
    await report.scheduleForShareCode(st.shareCodeId)
      .catch((e) => logToFile('⚠️ could not schedule class report', { error: e.message }));

    await supabase.rpc('increment_share_code_uses', { code_id: st.shareCodeId })
      .catch(async () => {
        // No RPC yet — a read-modify-write is fine at this volume.
        const { data } = await supabase.from('quiz_share_codes')
          .select('uses_count').eq('id', st.shareCodeId).maybeSingle();
        await supabase.from('quiz_share_codes')
          .update({ uses_count: (data?.uses_count || 0) + 1 })
          .eq('id', st.shareCodeId);
      });
    return true;
  }
  return false;
}

module.exports = {
  mintCode, offerShare, handleShareButton, deliverClassLink,
  parseShareCode, beginFromCode, consumeJoinReply, handleJoinFlowReply,
  SHARE_YES, SHARE_NO, JOIN_KEY, JOIN_FLOW_PREFIX, CODE_RX, randomCode, botNumber,
};
