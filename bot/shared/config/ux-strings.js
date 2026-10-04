'use strict';
/**
 * Fixed copy for the lesson quiz, and the one language clamp it renders through.
 *
 * Two things live here because they are the same problem seen from two sides: the
 * clamp answers "which language can this surface render in", and the catalogue
 * answers "what does it say in that language".
 *
 * THE CATALOGUE LANGUAGES are English and Urdu (the `ur` language pack). A teacher
 * or child whose language has no copy here reads English — the floor — while the
 * quiz QUESTIONS can still be written in any language the deployment offers
 * (QUIZ_LANGUAGES). Adding a language pack is one more key per entry below plus
 * its code in CATALOGUE_LANGUAGES; never control flow.
 *
 * WHY THIS IS NOT config/system-messages.js. That file is the platform's
 * customisation seam (docs/agent-customization.md points adopters at it), with
 * no placeholders and a different fallback contract. This catalogue needs
 * {placeholders}, throws on an unknown key or a missing parameter (a blank or a
 * literal "{lesson}" reaching a teacher is worse than a failing test), and keeps
 * each paragraph reading in its own direction when a value of the other script
 * opens it.
 */

const { isRTL, getEnglishName } = require('./supported-languages');

/** The emergency floor: what a surface renders in when nothing else can be determined. */
const FLOOR = 'en';

/** The languages this catalogue carries copy for. */
const CATALOGUE_LANGUAGES = Object.freeze(['en', 'ur']);

/**
 * Collapse any language code to one this catalogue can render.
 *
 * Total by construction: junk, null and non-strings return the floor rather than
 * throwing, because this sits on render paths that must not fail closed.
 *
 * @param {*} lang
 * @param {string[]} [offered] narrow the catalogue further; cannot widen it
 * @returns {string} a catalogue language code
 */
function clampLanguage(lang, offered = CATALOGUE_LANGUAGES) {
  if (typeof lang !== 'string') return FLOOR;
  const code = lang.trim();
  if (!code) return FLOOR;
  return offered.includes(code) && CATALOGUE_LANGUAGES.includes(code) ? code : FLOOR;
}

/** The copy. One entry per key, one string per catalogue language. */
const UX_STRINGS = {
  lineDirMark: {
    en: '‎',
    ur: '‏',
  },
  lpQuizCouldNotStart: {
    en: 'I couldn’t start that quiz just now — sorry. The next lessons you plan will get a new offer.',
    ur: 'معذرت، وہ quiz ابھی شروع نہیں ہو سکا۔ آپ کے اگلے پلان کیے گئے اسباق پر نئی پیشکش آئے گی۔',
  },
  lpQuizCouldNotStartLater: {
    en: 'I couldn’t start that quiz just now — sorry. The problem was on my side, not your lesson plan. Try it again from /quiz a little later.',
    ur: 'معذرت، وہ quiz ابھی شروع نہیں ہو سکا۔ مسئلہ میری طرف سے تھا، lesson plan میں نہیں۔ کچھ دیر بعد ⁦/quiz⁩ سے دوبارہ کوشش کریں۔',
  },
  lpQuizCouldNotStartMenu: {
    en: 'I couldn’t start that quiz just now — sorry. The problem was on my side, not your lesson plan. Send /quiz to pick another lesson.',
    ur: 'معذرت، وہ quiz ابھی شروع نہیں ہو سکا۔ مسئلہ میری طرف سے تھا، lesson plan میں نہیں۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  lpQuizCouldNotStartRetry: {
    en: 'I couldn’t start that quiz just now — sorry. The problem was on my side, not your lesson plan. Send /quiz and pick this lesson to try again.',
    ur: 'معذرت، وہ quiz ابھی شروع نہیں ہو سکا۔ مسئلہ میری طرف سے تھا، lesson plan میں نہیں۔ دوبارہ کوشش کے لیے ⁦/quiz⁩ بھیجیں اور یہی سبق چنیں۔',
  },
  lessonPlansUnavailable: {
    en: 'Lesson plans aren’t available on this service yet.',
    ur: 'اس سروس پر ابھی lesson plans دستیاب نہیں ہیں۔',
  },
  lpQuizMaking: {
    en: 'Making it now — about a minute. The quiz will arrive here with the message to forward to your class.',
    ur: '‏quiz ابھی تیار ہو رہا ہے — تقریباً ایک منٹ۔ پھر یہیں quiz اور کلاس کو آگے بھیجنے والا پیغام آئے گا۔',
  },
  sqActionCard: {
    en: 'See my class card',
    ur: 'میرا class card',
  },
  sqActionCardDesc: {
    en: 'Where you stand in the class',
    ur: 'کلاس میں آپ کہاں ہیں',
  },
  sqActionRetry: {
    en: 'Try again',
    ur: 'دوبارہ کریں',
  },
  sqActionRetryDesc: {
    en: 'Take this quiz once more',
    ur: 'یہ quiz ایک بار پھر کریں',
  },
  sqActionsLabel: {
    en: 'What would you like to do?',
    ur: 'کیا کرنا ہے؟',
  },
  sqClassAverage: {
    en: 'Class average: {n}%',
    ur: 'کلاس کا اوسط: {n}%',
  },
  sqClose: {
    en: 'Close',
    ur: 'بند کریں',
  },
  sqCodeExpired: {
    en: 'That quiz link has closed — ask your class for a new one.',
    ur: 'اس quiz کا link بند ہو چکا ہے — کلاس سے نیا link لیں۔',
  },
  sqCta: {
    en: 'Continue',
    ur: 'آگے بڑھیں',
  },
  sqDoneEmptyBody: {
    en: 'Your quizzes come from the link your class shares. When you have taken one, it will be here.',
    ur: 'آپ کے quiz کلاس کے link سے آتے ہیں۔ ایک بار کرنے کے بعد وہ یہاں ملے گا۔',
  },
  sqDoneEmptyHeading: {
    en: 'No quizzes yet',
    ur: 'ابھی کوئی quiz نہیں',
  },
  sqDoneErrBody: {
    en: 'Please send ⁦/quiz⁩ again in a moment.',
    ur: 'تھوڑی دیر بعد ⁦/quiz⁩ دوبارہ بھیجیں۔',
  },
  sqDoneErrHeading: {
    en: 'Something went wrong',
    ur: 'کچھ گڑبڑ ہو گئی',
  },
  sqErrGeneric: {
    en: 'Something went wrong — try again.',
    ur: 'کچھ گڑبڑ ہو گئی — دوبارہ کوشش کریں۔',
  },
  sqErrGone: {
    en: 'That quiz is no longer available.',
    ur: 'یہ quiz اب دستیاب نہیں۔',
  },
  sqErrNothingToDo: {
    en: 'Nothing to do for that quiz yet.',
    ur: 'اس quiz کے لیے ابھی کچھ نہیں۔',
  },
  sqFallbackBody: {
    en: 'Your last quiz: *{topic}* — {score}.\nTry it again, or see your class card?',
    ur: '‏آپ کا آخری quiz: *{topic}* — {score}۔\nدوبارہ کریں، یا اپنا class card دیکھیں؟',
  },
  sqFlowBody: {
    en: 'Pick a quiz to try it again or see your class card.',
    ur: 'کوئی quiz چنیں — دوبارہ کریں یا اپنا class card دیکھیں۔',
  },
  sqFlowButton: {
    en: 'Open',
    ur: 'کھولیں',
  },
  sqFlowHeader: {
    en: '📝 Your quizzes',
    ur: '📝 آپ کے quiz',
  },
  sqInFlight: {
    en: 'Finish the quiz you are on first.',
    ur: 'پہلے جاری quiz مکمل کریں۔',
  },
  sqNoCardYet: {
    en: 'No class card for that quiz yet — finish it first, and the card comes with the class results.',
    ur: 'اس quiz کا class card ابھی نہیں — پہلے اسے مکمل کریں، card کلاس کے نتائج کے ساتھ آئے گا۔',
  },
  sqNoQuizzes: {
    en: 'No quizzes yet — they come from the link your class shares. Send ⁦/video⁩ for videos meanwhile.',
    ur: 'ابھی کوئی quiz نہیں — وہ کلاس کے link سے آتے ہیں۔ فی الحال ویڈیوز کے لیے ⁦/video⁩ بھیجیں۔',
  },
  sqRetryStarting: {
    en: 'Here it comes again — good luck!',
    ur: 'لیجیے، دوبارہ شروع — best of luck!',
  },
  sqRowScores: {
    en: '{latest} · best {best}',
    ur: '‏{latest} · بہترین {best}',
  },
  sqScreenQuizzes: {
    en: 'Your quizzes',
    ur: 'آپ کے quiz',
  },
  sqUntitled: {
    en: 'Quiz',
    ur: 'Quiz',
  },
  sqYourBest: {
    en: 'Your best: {score}',
    ur: 'آپ کا بہترین: {score}',
  },
  sqYourLatest: {
    en: 'Your latest: {score}',
    ur: 'آپ کا تازہ ترین: {score}',
  },
  tqAlreadyMaking: {
    en: 'Already on it — the quiz is coming.',
    ur: 'پہلے ہی تیار ہو رہا ہے — بس آ رہا ہے۔',
  },
  tqAlreadySent: {
    en: 'That quiz has already been sent — send /quiz to resend its link or get the report.',
    ur: 'وہ quiz پہلے ہی بھیجا جا چکا ہے — link دوبارہ لینے یا رپورٹ کے لیے /quiz بھیجیں۔',
  },
  tqAskLanguage: {
    en: 'Which language should the quiz be in?\n\nUrdu — English terms stay in English letters ({examples}).\nEnglish — the whole quiz in English.\n\nTap one.',
    ur: '‏quiz کس زبان میں ہو؟\n\nاردو — English اصطلاحات انگریزی حروف میں ({examples})۔\n‏English — پورا quiz انگریزی میں۔\n\nایک کو tap کریں۔',
  },
  tqAskLanguagePlain: {
    en: 'Which language should the quiz be in?\n\nUrdu — English terms stay in English letters.\nEnglish — the whole quiz in English.\n\nTap one.',
    ur: '‏quiz کس زبان میں ہو؟\n\nاردو — English اصطلاحات انگریزی حروف میں۔\n‏English — پورا quiz انگریزی میں۔\n\nایک کو tap کریں۔',
  },
  tqBackButton: {
    en: 'Back to lessons',
    ur: 'اسباق پر واپس',
  },
  tqCouldNotMake: {
    en: 'I couldn’t make a good quiz from this lesson’s recording — the transcript didn’t carry enough of what was taught clearly. Try /quiz after your next lesson.',
    ur: 'اس سبق کی ریکارڈنگ سے اچھا quiz نہیں بن سکا — transcript میں پڑھایا ہوا مواد کافی واضح نہیں تھا۔ اگلے سبق کے بعد /quiz آزمائیں۔',
  },
  tqCouldNotMakeAuthor: {
    en: 'Sorry — I couldn’t write good enough questions from this lesson this time. The problem was on my side, not your recording. Send /quiz and pick this lesson to make it again.',
    ur: 'معذرت — اس بار اس سبق سے اچھے سوالات نہیں بن سکے۔ مسئلہ میری طرف سے تھا، آپ کی ریکارڈنگ میں نہیں۔ دوبارہ بنانے کے لیے ⁦/quiz⁩ بھیجیں اور یہی سبق چنیں۔',
  },
  tqCouldNotMakeModel: {
    en: 'Sorry — something went wrong on my side while writing the quiz for this lesson, so it could not be finished. The problem was not your recording. Send /quiz and pick this lesson to try again.',
    ur: 'معذرت — اس سبق کا quiz لکھتے ہوئے میری طرف سے خرابی ہو گئی، اس لیے یہ مکمل نہیں ہو سکا۔ مسئلہ آپ کی ریکارڈنگ میں نہیں تھا۔ دوبارہ کوشش کے لیے ⁦/quiz⁩ بھیجیں اور یہی سبق چنیں۔',
  },
  tqCouldNotMakeSessionGone: {
    en: 'Sorry — this lesson’s recording is no longer available, so the quiz could not be made. Send /quiz to pick another lesson.',
    ur: 'معذرت — اس سبق کی ریکارڈنگ اب دستیاب نہیں، اس لیے quiz نہیں بن سکا۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqCouldNotSend: {
    en: 'The quiz is ready but the class link could not be created just now. Send /quiz in a moment to get it.',
    ur: 'آپ کا quiz تیار ہے لیکن کلاس کا link ابھی نہیں بن سکا۔ تھوڑی دیر بعد /quiz بھیج کر حاصل کریں۔',
  },
  tqDailyCap: {
    en: 'You\'ve reached today\'s limit for new quizzes, so I haven\'t made this one. I can make it tomorrow: send /quiz then and pick this lesson.',
    ur: 'آج کے نئے quiz کی حد پوری ہو گئی ہے، اس لیے یہ quiz نہیں بنایا گیا۔ یہ کل بن سکتا ہے: کل ⁦/quiz⁩ بھیجیں اور یہی سبق چنیں۔',
  },
  tqDailyCapTopic: {
    en: 'You’ve reached today’s limit for new quizzes, so I haven’t made this one. Send /quiz with the topic again tomorrow.',
    ur: '‏آج کے نئے quiz کی حد پوری ہو گئی ہے، اس لیے یہ quiz نہیں بنایا گیا۔ کل دوبارہ ⁦/quiz⁩ کے ساتھ موضوع بھیجیں۔',
  },
  tqDeclined: {
    en: 'No problem. You can make a quiz for any of your lessons anytime — just send /quiz.',
    ur: 'کوئی بات نہیں۔ کسی بھی سبق کا quiz کبھی بھی بنایا جا سکتا ہے — بس /quiz بھیجیں۔',
  },
  tqFailedKeyDisagreement: {
    en: 'I held this quiz back — when I checked it, some questions had a wrong or unclear answer, and I won’t send children a wrong answer. Send /quiz and pick this lesson to make it again.',
    ur: 'یہ quiz روک لیا گیا — جانچ میں کچھ سوالات کے جواب غلط یا غیر واضح نکلے، اور بچوں کو غلط جواب نہیں بھیجا جا سکتا۔ دوبارہ بنانے کے لیے ⁦/quiz⁩ بھیجیں اور یہی سبق چنیں۔',
  },
  tqFailedLpAuthor: {
    en: 'I couldn’t make a good quiz from that lesson plan — the questions didn’t come out clear enough. Send /quiz to pick another lesson.',
    ur: 'اس lesson plan سے اچھا quiz نہیں بن سکا — سوالات کافی واضح نہیں بنے۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedLpKeyConflict: {
    en: 'I held this quiz back — some of its answers didn’t match what that lesson plan teaches, and I won’t send children a wrong answer. Send /quiz to pick another lesson.',
    ur: 'یہ quiz روک لیا گیا — اس کے کچھ جوابات اس lesson plan کی بات سے میل نہیں کھاتے تھے، اور بچوں کو غلط جواب نہیں بھیجا جا سکتا۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedLpKeyDisagreement: {
    en: 'I held this quiz back — when I checked it, some questions from that lesson plan had a wrong or unclear answer, and I won’t send children a wrong answer. Send /quiz to pick another lesson.',
    ur: 'یہ quiz روک لیا گیا — جانچ میں اس lesson plan سے بنے کچھ سوالات کے جواب غلط یا غیر واضح نکلے، اور بچوں کو غلط جواب نہیں بھیجا جا سکتا۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedLpModel: {
    en: 'Sorry — something went wrong on my side while writing that quiz, so it could not be finished. The problem was not your lesson plan. Send /quiz to pick another lesson.',
    ur: 'معذرت — quiz لکھتے ہوئے میری طرف سے خرابی ہو گئی، اس لیے یہ مکمل نہیں ہو سکا۔ مسئلہ lesson plan میں نہیں تھا۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedLpSource: {
    en: 'I couldn’t open that lesson plan, so there was nothing to write the quiz from. Send /quiz to pick another lesson.',
    ur: 'اس سبق کا lesson plan نہیں کھل سکا، اس لیے quiz بنانے کے لیے کچھ نہیں تھا۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedLpSourceUnusable: {
    en: 'That lesson plan doesn’t have enough of the lesson in it for me to write a quiz from. Send /quiz to pick another lesson.',
    ur: 'اس lesson plan میں اتنا سبق موجود نہیں کہ اس سے quiz بن سکے۔ دوسرا سبق چننے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqFailedTopic: {
    en: 'Sorry — I couldn’t write good enough questions on that topic this time. The problem was on my side. Send /quiz with the topic to try again (for example: /quiz fractions).',
    ur: '‏معذرت — اس بار اس موضوع پر اچھے سوالات تیار نہیں ہو سکے۔ مسئلہ ہماری طرف تھا۔ دوبارہ کوشش کے لیے ⁦/quiz⁩ کے ساتھ موضوع بھیجیں (مثلاً: ⁦/quiz fractions⁩)۔',
  },
  tqFlowActionDone: {
    en: 'Done',
    ur: 'ٹھیک ہے',
  },
  tqFlowActionDoneDesc: {
    en: 'Close this for now.',
    ur: 'ابھی کے لیے بند کریں۔',
  },
  tqFlowActionLink: {
    en: 'Resend link',
    ur: '‏link دوبارہ بھیجیں',
  },
  tqFlowActionLinkDesc: {
    en: 'The PDF, then the message to forward — the same link as before, never a new one.',
    ur: '‏PDF، پھر آگے بھیجنے والا پیغام — وہی پرانا link، نیا نہیں۔',
  },
  tqFlowActionMake: {
    en: 'Make the quiz',
    ur: '‏quiz بنائیں',
  },
  tqFlowActionMakeDesc: {
    en: '8 questions from what you taught in this lesson. About a minute.',
    ur: 'اس سبق میں آپ نے جو پڑھایا، اس پر 8 سوالات۔ تقریباً ایک منٹ۔',
  },
  tqFlowActionMakeDescLp: {
    en: '8 questions on the lesson you planned. About a minute.',
    ur: 'آپ کے سبق کے منصوبے پر ۸ سوال۔ تقریباً ایک منٹ۔',
  },
  tqFlowActionMakeIn: {
    en: 'Make it in {language}',
    ur: '‏{language} میں بنائیں',
  },
  tqFlowActionRemake: {
    en: 'Make it again',
    ur: 'دوبارہ بنائیں',
  },
  tqFlowActionRemakeDesc: {
    en: 'A fresh try from the same lesson plan. About a minute.',
    ur: 'اسی lesson plan سے نئی کوشش۔ تقریباً ایک منٹ۔',
  },
  tqFlowActionReport: {
    en: 'Generate report',
    ur: 'رپورٹ بنائیں',
  },
  tqFlowActionReportDesc: {
    en: 'Counted again right now — everyone who has finished since the last report is in it.',
    ur: 'ابھی دوبارہ گنا جائے گا — پچھلی رپورٹ کے بعد جس نے بھی مکمل کیا وہ بھی شامل ہو گا۔',
  },
  tqFlowActionsLabel: {
    en: 'What next?',
    ur: 'اب کیا کریں؟',
  },
  tqFlowChatBody: {
    en: 'Your lessons, newest first. Open one to see how the class did, get its report, or resend its link — all in here, without leaving this screen.',
    ur: 'آپ کے اسباق، نئے سے پرانے۔ کوئی ایک کھولیں — کلاس کا نتیجہ دیکھیں، رپورٹ لیں یا link دوبارہ بھیجیں، سب اسی سکرین میں۔',
  },
  tqFlowChatCta: {
    en: 'Open',
    ur: 'کھولیں',
  },
  tqFlowChatHeader: {
    en: '📝 Your quizzes',
    ur: '📝 آپ کے quizzes',
  },
  tqFlowClose: {
    en: 'Close',
    ur: 'بند کریں',
  },
  tqFlowContinue: {
    en: 'Continue',
    ur: 'آگے بڑھیں',
  },
  tqFlowDoneLinkBody: {
    en: 'The PDF first, then the message to forward to your class group. It carries the same link as before.',
    ur: 'پہلے PDF، پھر وہ پیغام جو class group میں forward کرنا ہے۔ اس میں وہی پرانا link ہے۔',
  },
  tqFlowDoneLinkHead: {
    en: 'The link is on its way',
    ur: '‏link بھیجا جا رہا ہے',
  },
  tqFlowDoneMakeBody: {
    en: 'About a minute. The quiz and the message to forward will arrive in your chat.',
    ur: 'تقریباً ایک منٹ۔ quiz اور آگے بھیجنے والا پیغام آپ کی chat میں آ جائے گا۔',
  },
  tqFlowDoneMakeHead: {
    en: 'Making the quiz',
    ur: '‏quiz بن رہا ہے',
  },
  tqFlowDoneReportBody: {
    en: 'Recounting now. The report will arrive in your chat in a minute or two — the class summary, how each student did, and what is worth reteaching.',
    ur: 'ابھی دوبارہ گنا جا رہا ہے۔ ایک دو منٹ میں رپورٹ آپ کی chat میں آ جائے گی — کلاس کا خلاصہ، ہر طالب علم کا نتیجہ، اور کیا دوبارہ پڑھانا ہے۔',
  },
  tqFlowDoneReportHead: {
    en: 'Your report is on its way',
    ur: 'آپ کی رپورٹ آ رہی ہے',
  },
  tqFlowDoneTitle: {
    en: 'On its way',
    ur: 'بھیجا جا رہا ہے',
  },
  tqFlowDoneWaitBody: {
    en: 'About a minute. The quiz will arrive in your chat with the message to forward.',
    ur: 'تقریباً ایک منٹ۔ quiz آگے بھیجنے والے پیغام کے ساتھ آپ کی chat میں آ جائے گا۔',
  },
  tqFlowDoneWaitHead: {
    en: 'Still being made',
    ur: 'ابھی تیار ہو رہا ہے',
  },
  tqFlowEachStudent: {
    en: 'How each student did',
    ur: 'ہر طالب علم کا نتیجہ',
  },
  tqFlowEmptyDesc: {
    en: 'Record one first',
    ur: 'پہلے ریکارڈ کریں',
  },
  tqFlowEmptyDescPlans: {
    en: 'Nothing here yet',
    ur: 'ابھی کچھ نہیں',
  },
  tqFlowEmptyMeta: {
    en: 'Record a lesson for coaching, then /quiz turns it into a quiz.',
    ur: 'پہلے coaching کے لیے سبق ریکارڈ کریں، پھر /quiz اس کا quiz بنا دے گا۔',
  },
  tqFlowEmptyMetaPlans: {
    en: 'Take a lesson plan or record a lesson, then /quiz turns it into a quiz.',
    ur: 'سبق کا منصوبہ لیں یا سبق ریکارڈ کریں، پھر ⁦/quiz⁩ اس کا quiz بنا دے گا۔',
  },
  tqFlowEmptyTitle: {
    en: 'No lessons yet',
    ur: 'ابھی کوئی سبق نہیں',
  },
  tqFlowErrGeneric: {
    en: 'Something went wrong — try again.',
    ur: 'کچھ غلط ہو گیا — دوبارہ کوشش کریں۔',
  },
  tqFlowErrLookup: {
    en: 'Could not load your lessons just now. Please tap again.',
    ur: 'ابھی آپ کے اسباق نہیں کھل سکے۔ دوبارہ tap کریں۔',
  },
  tqFlowErrNotYours: {
    en: 'That lesson could not be found.',
    ur: 'وہ سبق نہیں مل سکا۔',
  },
  tqFlowErrPickAction: {
    en: 'Pick one of the options first.',
    ur: 'پہلے کوئی ایک آپشن منتخب کریں۔',
  },
  tqFlowLessonSub: {
    en: '{date} · {subject} · {status}',
    ur: '‏{date} · {subject} · {status}',
  },
  tqFlowLessonSubNoSubject: {
    en: '{date} · {status}',
    ur: '‏{date} · {status}',
  },
  tqFlowLessonTitle: {
    en: 'This lesson',
    ur: 'یہ سبق',
  },
  tqFlowLessonsTitle: {
    en: 'Your lessons',
    ur: 'آپ کے اسباق',
  },
  tqFlowMoreStudents: {
    en: '…and {n} more',
    ur: '…اور {n} مزید',
  },
  tqFlowNewer: {
    en: 'Newer lessons…',
    ur: 'نئے اسباق…',
  },
  tqFlowNewerMeta: {
    en: 'Back to the {n} more recent lessons',
    ur: 'پچھلے {n} حالیہ اسباق پر واپس',
  },
  tqFlowOlder: {
    en: 'Older lessons…',
    ur: 'پرانے اسباق…',
  },
  tqFlowOlderMeta: {
    en: 'The next {n}, going further back',
    ur: 'اگلے {n}، اس سے بھی پیچھے',
  },
  tqFlowPageNum: {
    en: 'Page {page}',
    ur: 'صفحہ {page}',
  },
  tqFlowResultsFailed: {
    en: 'The last attempt did not produce a good quiz from this lesson’s recording. You can try again.',
    ur: 'پچھلی کوشش میں اس سبق کی ریکارڈنگ سے اچھا quiz نہیں بن سکا۔ دوبارہ کوشش کی جا سکتی ہے۔',
  },
  tqFlowResultsFailedAuthor: {
    en: 'Last time I couldn’t write good enough questions from this lesson. The problem was on my side, not your recording. You can make it again.',
    ur: 'پچھلی بار اس سبق سے اچھے سوالات نہیں بن سکے۔ مسئلہ میری طرف سے تھا، آپ کی ریکارڈنگ میں نہیں۔ دوبارہ بنایا جا سکتا ہے۔',
  },
  tqFlowResultsFailedKeys: {
    en: 'The last quiz from this lesson was held back: when I checked it, some questions had a wrong or unclear answer, and I won’t send children a wrong answer. You can make it again.',
    ur: 'اس سبق کا پچھلا quiz روک لیا گیا — جانچ میں کچھ سوالات کے جواب غلط یا غیر واضح نکلے، اور بچوں کو غلط جواب نہیں بھیجا جا سکتا۔ دوبارہ بنایا جا سکتا ہے۔',
  },
  tqFlowResultsFailedLp: {
    en: 'This quiz could not be made from the lesson plan. The next lesson you plan can have a quiz of its own.',
    ur: 'اس lesson plan سے quiz نہیں بن سکا۔ اگلے سبق کا plan بنے گا تو اس کا اپنا quiz بن سکتا ہے۔',
  },
  tqFlowResultsFailedLpChecks: {
    en: 'The quiz written from this lesson plan was held back: some of its questions or answers were not clear or right enough to send to children.',
    ur: 'اس lesson plan سے بنا quiz روک لیا گیا — اس کے کچھ سوالات یا جوابات اتنے واضح یا درست نہیں تھے کہ بچوں کو بھیجے جا سکیں۔',
  },
  tqFlowResultsFailedLpModel: {
    en: 'Something went wrong on my side while writing this quiz, so it could not be finished. The problem was not your lesson plan.',
    ur: '‏quiz لکھتے ہوئے میری طرف سے خرابی ہو گئی، اس لیے یہ مکمل نہیں ہو سکا۔ مسئلہ lesson plan میں نہیں تھا۔',
  },
  tqFlowResultsFailedLpSource: {
    en: 'I couldn’t open this lesson plan, so there was nothing to write the quiz from.',
    ur: 'اس سبق کا lesson plan نہیں کھل سکا، اس لیے quiz بنانے کے لیے کچھ نہیں تھا۔',
  },
  tqFlowResultsFailedLpStart: {
    en: 'This quiz could not be started on my side. The problem was not your lesson plan.',
    ur: 'یہ quiz میری طرف سے شروع نہیں ہو سکا۔ مسئلہ lesson plan میں نہیں تھا۔',
  },
  tqFlowResultsFailedLpUnusable: {
    en: 'This lesson plan doesn’t have enough of the lesson in it to write a quiz from.',
    ur: 'اس lesson plan میں اتنا سبق موجود نہیں کہ اس سے quiz بن سکے۔',
  },
  tqFlowResultsFailedModel: {
    en: 'Something went wrong on my side while writing this quiz, so it could not be finished. The problem was not your recording. You can try again.',
    ur: '‏quiz لکھتے ہوئے میری طرف سے خرابی ہو گئی، اس لیے یہ مکمل نہیں ہو سکا۔ مسئلہ آپ کی ریکارڈنگ میں نہیں تھا۔ دوبارہ کوشش کی جا سکتی ہے۔',
  },
  tqFlowResultsHead: {
    en: '{started} started · {finished} finished · average {avg}%',
    ur: '‏{started} نے شروع کیا، {finished} نے مکمل، اوسط ⁦{avg}%⁩',
  },
  tqFlowResultsLater: {
    en: 'Open this lesson here again a little later to make it.',
    ur: 'کچھ دیر بعد یہ سبق یہاں دوبارہ کھولیں اور quiz بنائیں۔',
  },
  tqFlowResultsMaking: {
    en: 'The quiz is being made — about a minute. It will arrive in your chat with the message to forward.',
    ur: '‏quiz تیار ہو رہا ہے — تقریباً ایک منٹ۔ آگے بھیجنے والے پیغام کے ساتھ آپ کی chat میں آ جائے گا۔',
  },
  tqFlowResultsNextLesson: {
    en: 'The next lesson you plan can have a quiz of its own.',
    ur: 'اگلے سبق کا plan بنے گا تو اس کا اپنا quiz بن سکتا ہے۔',
  },
  tqFlowResultsNoQuiz: {
    en: 'No quiz has been made from this lesson yet. Making one takes about a minute.',
    ur: 'اس سبق سے ابھی کوئی quiz نہیں بنا۔ بنانے میں تقریباً ایک منٹ لگتا ہے۔',
  },
  tqFlowResultsNoQuizLp: {
    en: 'No quiz was made for this lesson. The next lesson you plan can have a quiz of its own.',
    ur: 'اس سبق کا quiz نہیں بنا۔ اگلے سبق کا plan بنے گا تو اس کا اپنا quiz بن سکتا ہے۔',
  },
  tqFlowResultsNobody: {
    en: 'Nobody has opened this quiz yet. Resend the link and it will show up here as students take it.',
    ur: 'ابھی کسی نے یہ quiz نہیں کھولا۔ link دوبارہ بھیجیں — طلبہ کے حل کرتے ہی نتیجہ یہیں نظر آئے گا۔',
  },
  tqFlowResultsNothingToReport: {
    en: 'No student has finished this quiz yet, so there is nothing to report. Resend the link — once students finish, the report can be made here.',
    ur: 'ابھی کسی نے یہ quiz مکمل نہیں کیا، اس لیے رپورٹ کے لیے کچھ نہیں۔ link دوبارہ بھیجیں — طلبہ کے مکمل کرنے کے بعد رپورٹ یہیں سے بن سکتی ہے۔',
  },
  tqFlowResultsRemakeHint: {
    en: 'Choose “Make it again” to try once more — about a minute.',
    ur: 'دوبارہ کوشش کے لیے «دوبارہ بنائیں» چنیں — تقریباً ایک منٹ۔',
  },
  tqFlowResultsStartedOnly: {
    en: '{started} started · nobody has finished yet',
    ur: '‏{started} نے شروع کیا، ابھی کسی نے مکمل نہیں کیا',
  },
  tqFlowStatusFailed: {
    en: 'Didn’t work',
    ur: 'نہیں بن سکا',
  },
  tqFlowStatusMaking: {
    en: 'Being made…',
    ur: 'تیار ہو رہا ہے…',
  },
  tqFlowStatusNone: {
    en: 'No quiz yet',
    ur: 'ابھی quiz نہیں',
  },
  tqFlowStatusReport: {
    en: 'Report sent · {finished}',
    ur: 'رپورٹ بھیجی · {finished}',
  },
  tqFlowStatusSent: {
    en: '{started} started',
    ur: '‏{started} نے شروع',
  },
  tqFlowStillGoing: {
    en: 'Still going: {names}',
    ur: 'ابھی حل کر رہے ہیں: {names}',
  },
  tqFlowStopped: {
    en: 'Stopped before the end: {names}',
    ur: '‏quiz بیچ میں روک دیا گیا: {names}',
  },
  tqFlowStudentLine: {
    en: '• {name}{klass} — {score}',
    ur: '• {name}{klass} — {score}',
  },
  tqFlowUnnamed: {
    en: 'Unnamed',
    ur: 'بےنام',
  },
  tqForwardThis: {
    en: 'Forward THIS message to your students:',
    ur: 'یہ پیغام طلبہ کو forward کریں:',
  },
  tqHandoffIntro: {
    en: '📝 Your quiz: {lesson} — {n} questions.\n\nThis PDF is for you: what you taught, what the quiz checks, and every question with its correct answer marked.\n\nThe NEXT message is for your students — forward it to the class group.',
    ur: '‏📝 آپ کا quiz: {lesson}، {n} سوالات۔\n\nیہ PDF آپ کے لیے ہے: آپ نے کیا پڑھایا، کوئز کیا جانچتا ہے، اور ہر سوال کے ساتھ درست جواب نشان زد۔\n\nاگلا پیغام طلبہ کے لیے ہے — اسے class group میں forward کریں۔',
  },
  tqHandoffIntroLp: {
    en: '📝 Your quiz: {lesson} — {n} questions.\n\nThis PDF is for you: what you planned, what the quiz checks, and every question with its correct answer marked.\n\nThe NEXT message is for your students — forward it to the class group.',
    ur: '‏📝 آپ کا quiz: {lesson}، {n} سوالات۔\n\nیہ PDF آپ کے لیے ہے: آپ کے سبق کا منصوبہ، quiz کیا جانچتا ہے، اور ہر سوال کے ساتھ درست جواب نشان زد۔\n\nاگلا پیغام طلبہ کے لیے ہے — اسے class group میں forward کریں۔',
  },
  tqHandoffIntroTopic: {
    en: '📝 Your quiz: {lesson} — {n} questions.\n\nThis PDF is for you: what the quiz on this topic checks, and every question with its correct answer marked.\n\nThe NEXT message is for your students — forward it to the class group.',
    ur: '‏📝 آپ کا quiz: {lesson}، {n} سوالات۔\n\nیہ PDF آپ کے لیے ہے: اس موضوع پر quiz کیا جانچتا ہے، اور ہر سوال کے ساتھ درست جواب نشان زد۔\n\nاگلا پیغام طلبہ کے لیے ہے — اسے class group میں forward کریں۔',
  },
  tqLessonNoTopic: {
    en: '{subject} lesson',
    ur: '‏{subject} کا سبق',
  },
  tqLessonOnSubject: {
    en: '{subject} lesson on {topic}',
    ur: '‏{subject} کا سبق — {topic}',
  },
  tqLessonOnTopic: {
    en: 'lesson on {topic}',
    ur: 'سبق — {topic}',
  },
  tqLessonPlain: {
    en: 'lesson',
    ur: 'سبق',
  },
  tqLessonWord: {
    en: 'Lesson',
    ur: 'سبق',
  },
  tqLinkButton: {
    en: 'Resend link',
    ur: 'دوبارہ link بھیجیں',
  },
  tqListBody: {
    en: 'Your lessons, newest first. Pick one to make a quiz, resend its link, or get its report.',
    ur: 'آپ کے اسباق، نئے سے پرانے۔ کوئی ایک چنیں — quiz بنانے، link دوبارہ بھیجنے یا رپورٹ لینے کے لیے۔',
  },
  tqListButton: {
    en: 'Choose lesson',
    ur: 'سبق چنیں',
  },
  tqListEmpty: {
    en: 'No lessons yet. Record a lesson for coaching first — then /quiz can turn it into a quiz for your students.',
    ur: 'ابھی کوئی سبق نہیں۔ پہلے coaching کے لیے سبق ریکارڈ کریں — پھر /quiz اسے طلبہ کے لیے quiz بنا دے گا۔',
  },
  tqListEmptyMenu: {
    en: 'No lessons yet. Record a lesson for coaching or make a lesson plan first — then /quiz can turn it into a quiz for your students.\n\nOr choose one of these:',
    ur: '‏ابھی کوئی سبق نہیں۔ پہلے coaching کے لیے سبق ریکارڈ کریں یا سبق کا منصوبہ بنائیں — پھر ⁦/quiz⁩ اسے طلبہ کے لیے quiz بنا دے گا۔\n\nیا ان میں سے کوئی ایک چنیں:',
  },
  tqListEmptyPlans: {
    en: 'No lessons yet. Once you take a lesson plan or record a lesson for coaching, /quiz can turn it into a quiz for your students.',
    ur: 'ابھی کوئی سبق نہیں۔ سبق کا منصوبہ لینے یا coaching کے لیے سبق ریکارڈ کرنے کے بعد ⁦/quiz⁩ اسے طلبہ کے لیے quiz بنا دے گا۔',
  },
  tqListHeader: {
    en: 'Lessons {from}–{to}',
    ur: 'اسباق {from}–{to}',
  },
  tqListSection: {
    en: 'Recent lessons',
    ur: 'حالیہ اسباق',
  },
  tqLpLessonUnavailable: {
    en: 'A quiz can’t be made from that lesson plan any more. Send /quiz to see your lessons.',
    ur: 'اس سبق کے منصوبے سے اب quiz نہیں بن سکتا۔ اپنے اسباق دیکھنے کے لیے ⁦/quiz⁩ بھیجیں۔',
  },
  tqMaking: {
    en: 'Making it now — about a minute. The quiz will arrive here with the message to forward.',
    ur: 'آپ کا quiz تیار ہو رہا ہے — تقریباً ایک منٹ۔ پھر یہیں quiz اور آگے بھیجنے والا پیغام آئے گا۔',
  },
  tqMenuButton: {
    en: 'Choose',
    ur: 'چنیں',
  },
  tqMenuClassicDesc: {
    en: 'The classic quiz, sent to each student’s parent',
    ur: 'پرانا طریقہ: طلبہ کے والدین کے فون پر quiz',
  },
  tqMenuClassicTitle: {
    en: 'Quiz to parents\' phones',
    ur: 'والدین کے فون پر quiz',
  },
  tqMenuHeader: {
    en: 'Your quizzes',
    ur: 'آپ کے quiz',
  },
  tqMenuSection: {
    en: 'More quizzes',
    ur: 'مزید quiz',
  },
  tqMenuTopicDesc: {
    en: 'Type a topic and get a quiz for your class',
    ur: 'موضوع لکھیں اور کلاس کے لیے quiz حاصل کریں',
  },
  tqMenuTopicTitle: {
    en: 'Quiz on any topic',
    ur: 'کسی بھی موضوع پر quiz',
  },
  tqMenuVideoDesc: {
    en: 'Pick a short video for your class — a quiz follows it',
    ur: 'کلاس کے لیے مختصر ویڈیو چنیں — اس کے بعد quiz آئے گا',
  },
  tqMenuVideoTitle: {
    en: 'Video quizzes',
    ur: 'ویڈیو quiz',
  },
  tqNoReportYet: {
    en: 'No one has finished this quiz yet, so there is nothing to report. Resend the link?',
    ur: 'ابھی کسی نے یہ quiz مکمل نہیں کیا، اس لیے رپورٹ کے لیے کچھ نہیں۔ link دوبارہ بھیجیں؟',
  },
  tqNotYours: {
    en: 'I couldn’t find that lesson. Send /quiz to see your lessons.',
    ur: 'وہ سبق نہیں ملا۔ اپنے اسباق دیکھنے کے لیے /quiz بھیجیں۔',
  },
  tqNudge: {
    en: '{started} students have started your quiz on {topic} so far. Worth forwarding the link to the class group again?',
    ur: '‏{topic} پر آپ کے quiz کو اب تک {started} طلبہ نے شروع کیا ہے۔ link دوبارہ class group میں forward کر دیں؟',
  },
  tqNudgeMany: {
    en: '{count} of your quizzes have had almost nobody start yet: {topics}. Worth forwarding the links to the class group again?',
    ur: '‏آپ کے {count} quiz ابھی تک تقریباً کسی نے شروع نہیں کیے: {topics}۔ link دوبارہ class group میں forward کر دیں؟',
  },
  tqNudgeNone: {
    en: 'No one has started your quiz on {topic} yet. Worth forwarding the link to the class group again?',
    ur: '‏{topic} پر آپ کے quiz کو ابھی تک کسی نے شروع نہیں کیا۔ link دوبارہ class group میں forward کر دیں؟',
  },
  tqNudgeOne: {
    en: 'One student has started your quiz on {topic} so far. Worth forwarding the link to the class group again?',
    ur: '‏{topic} پر آپ کے quiz کو اب تک ایک طالب علم نے شروع کیا ہے۔ link دوبارہ class group میں forward کر دیں؟',
  },
  tqOffer: {
    en: 'Your {lesson}, {date}. I can make a short 8-question quiz your students take in their own chat — it checks what they learnt, and you get a report on what to reteach.\n\nWant it?\n\nYou can make one for any lesson anytime by sending /quiz.',
    ur: 'آپ کا {lesson}، {date}۔ طلبہ کے لیے 8 سوالوں کا مختصر quiz تیار ہو سکتا ہے — طلبہ اسے اپنی چیٹ میں حل کریں، اور آپ کو رپورٹ ملے کہ کیا سمجھ آیا اور کیا دوبارہ پڑھانا ہے۔\n\nبنا دیں؟\n\nکسی بھی سبق کا quiz کبھی بھی /quiz بھیج کر بنایا جا سکتا ہے۔',
  },
  tqOfferExpired: {
    en: 'That offer is no longer available — send /quiz to make a quiz for any lesson.',
    ur: 'وہ پیشکش اب دستیاب نہیں — کسی بھی سبق کا quiz بنانے کے لیے /quiz بھیجیں۔',
  },
  tqOfferNo: {
    en: 'Not now',
    ur: 'ابھی نہیں',
  },
  tqOfferYes: {
    en: 'Yes, make it',
    ur: 'جی، بنائیں',
  },
  tqPlaceHundreds: {
    en: 'Hundreds',
    ur: 'سینکڑے',
  },
  tqPlaceOnes: {
    en: 'Ones',
    ur: 'اکائیاں',
  },
  tqPlaceTens: {
    en: 'Tens',
    ur: 'دہائیاں',
  },
  tqPlaceThousands: {
    en: 'Thousands',
    ur: 'ہزار',
  },
  tqQuizStatus: {
    en: '*{topic}*\n{date} · {started} started · {finished} finished.\n\nResend the link, or regenerate the report?',
    ur: '‏*{topic}*\n{date}، {started} نے شروع کیا، {finished} مکمل۔\n\n‏link دوبارہ بھیجیں، یا رپورٹ دوبارہ بنائیں؟',
  },
  tqReportButton: {
    en: 'Regenerate report',
    ur: 'رپورٹ دوبارہ بنائیں',
  },
  tqReportComing: {
    en: 'Recounting now — every student who has finished since the last report is included. One moment…',
    ur: 'ابھی دوبارہ گنا جا رہا ہے — پچھلی رپورٹ کے بعد جس نے بھی مکمل کیا وہ بھی شامل ہے۔ ایک لمحہ…',
  },
  tqReportPromise: {
    en: 'You will get a report on how the class did about 12 hours after the first student starts (at {hour}:00 if that falls at night). To get it sooner, send /quiz, pick this lesson and ask for its report.',
    ur: 'پہلے طالب علم کے quiz شروع کرنے کے تقریباً 12 گھنٹے بعد کلاس کی رپورٹ آئے گی (اگر یہ وقت رات کا ہو تو صبح {hour} بجے)۔ رپورٹ اس سے پہلے چاہیے تو ⁦/quiz⁩ بھیجیں، یہی سبق چنیں اور رپورٹ منگوائیں۔',
  },
  tqReportPromiseAnytime: {
    en: 'You will get a report on how the class did about 12 hours after the first student starts. To get it sooner, send /quiz, pick this lesson and ask for its report.',
    ur: 'پہلے طالب علم کے quiz شروع کرنے کے تقریباً 12 گھنٹے بعد کلاس کی رپورٹ آئے گی۔ رپورٹ اس سے پہلے چاہیے تو ⁦/quiz⁩ بھیجیں، یہی سبق چنیں اور رپورٹ منگوائیں۔',
  },
  tqRowFailed: {
    en: 'Failed — tap to retry',
    ur: 'نہیں بنا — دوبارہ tap',
  },
  tqRowFailedLp: {
    en: 'Didn’t work',
    ur: 'نہیں بن سکا',
  },
  tqRowFromLessonPlan: {
    en: 'From lesson plan',
    ur: 'سبق کے منصوبے سے',
  },
  tqRowFromTopic: {
    en: 'Quiz on a topic',
    ur: 'موضوع پر quiz',
  },
  tqRowFromTranscript: {
    en: 'From transcript',
    ur: 'کلاس کی ریکارڈنگ سے',
  },
  tqRowMaking: {
    en: 'Being made…',
    ur: 'تیار ہو رہا ہے…',
  },
  tqRowNoQuiz: {
    en: 'No quiz yet',
    ur: 'ابھی quiz نہیں',
  },
  tqRowOlder: {
    en: 'Older lessons…',
    ur: 'پرانے اسباق…',
  },
  tqRowOlderDesc: {
    en: 'The next {n}, going back',
    ur: 'اگلے {n}، اور پیچھے',
  },
  tqRowReportSent: {
    en: 'Report sent · {finished} done',
    ur: 'رپورٹ بھیجی، {finished} مکمل',
  },
  tqRowSent: {
    en: 'Sent · {started} started · {finished} done',
    ur: 'بھیجا، {started} نے شروع، {finished} مکمل',
  },
  tqStillMaking: {
    en: 'That quiz is still being made — it will arrive here shortly.',
    ur: 'وہ quiz ابھی تیار ہو رہا ہے — تھوڑی دیر میں یہیں آئے گا۔',
  },
  tqStudentMessage: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}* — what we studied on {date}.\n\nTap here to start:\n{link}\n\nIt takes about 5 minutes. You will be asked your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے — جو ہم نے {date} کو پڑھا۔\n\nشروع کرنے کے لیے یہاں tap کریں:\n{link}\n\nتقریباً 5 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  tqStudentMessageCode: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}* — what we studied on {date}.\n\nTo start, send this code to {bot}:\n*QUIZ-{code}*\n\nIt takes about 5 minutes. You will be asked your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے — جو ہم نے {date} کو پڑھا۔\n\nشروع کرنے کے لیے {bot} کو یہ کوڈ بھیجیں:\n*QUIZ-{code}*\n\nتقریباً 5 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  tqStudentMessageJoin: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}* — what we studied on {date}.\n\nTo start, open a chat with {bot}:\n{link}\n\nand send this code:\n*QUIZ-{code}*\n\nIt takes about 5 minutes. You will be asked your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے — جو ہم نے {date} کو پڑھا۔\n\nشروع کرنے کے لیے {bot} سے چیٹ کھولیں:\n{link}\n\nاور یہ کوڈ بھیجیں:\n*QUIZ-{code}*\n\nتقریباً 5 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  tqSummaryTopicOnly: {
    en: 'Today’s lesson was about {topic}.',
    ur: 'آج کا سبق «⁨{topic}⁩» کے بارے میں تھا۔',
  },
  tqTeacherNamed: {
    en: 'Teacher {name}',
    ur: 'استاد {name}',
  },
  tqTodaysLesson: {
    en: 'today’s lesson',
    ur: 'آج کا سبق',
  },
  tqTopicAsk: {
    en: 'What topic should the quiz be on? Reply with the topic — for example: fractions.\n\nOr send /quiz followed by the topic at any time.',
    ur: '‏quiz کس موضوع پر ہو؟ جواب میں موضوع لکھیں — مثلاً: fractions۔\n\nیا کبھی بھی ⁦/quiz⁩ کے بعد موضوع لکھ کر بھیجیں۔',
  },
  tqVideoPickerBody: {
    en: 'Pick a class, subject and topic — the video comes to your chat, and a short quiz follows it.',
    ur: 'اپنی کلاس، مضمون اور موضوع چنیں — ویڈیو آپ کی چیٹ میں آئے گی، اور اس کے بعد ایک مختصر quiz۔',
  },
  tqVideoPickerCta: {
    en: 'Browse',
    ur: 'تلاش کریں',
  },
  tqVideoPickerHeader: {
    en: '🎬 Student Videos',
    ur: '🎬 طلبہ کی ویڈیوز',
  },
  tqVideoQuizzesHint: {
    en: 'Send /video to pick a video for your class — a short quiz follows each one.',
    ur: '‏کلاس کے لیے ویڈیو چننے کے لیے ⁦/video⁩ بھیجیں — ہر ویڈیو کے بعد ایک مختصر quiz آتا ہے۔',
  },
  tqYourTeacher: {
    en: 'Your teacher',
    ur: 'آپ کے استاد',
  },
  vqAskClass: {
    en: 'Thanks {name}! And which class are you in? (for example: Grade 4)',
    ur: 'شکریہ {name}! آپ کس جماعت میں ہیں؟ (مثلاً: جماعت 4)',
  },
  vqAskName: {
    en: 'First — what is your name?',
    ur: 'پہلے — آپ کا نام کیا ہے؟',
  },
  vqAskNameAgain: {
    en: 'No problem — what is your name?',
    ur: 'کوئی بات نہیں — آپ کا نام کیا ہے؟',
  },
  vqAskNameMissed: {
    en: 'I didn’t catch your name — what should I call you?',
    ur: 'نام سمجھ نہیں آیا — آپ کو کیا کہہ کر پکاریں؟',
  },
  vqBadgeDeveloping: {
    en: 'Nicely done',
    ur: 'بہت اچھا',
  },
  vqBadgeMastered: {
    en: 'Brilliant!',
    ur: 'زبردست!',
  },
  vqBadgeNeedsPractice: {
    en: 'Good effort',
    ur: 'اچھی کوشش',
  },
  vqCardAsk: {
    en: 'The question is in the picture above. Tap {letters}.',
    ur: '‏سوال اوپر تصویر میں ہے۔ {letters} دبائیں۔',
  },
  vqCardTapBelow: {
    en: 'Tap {letters} below',
    ur: 'نیچے {letters} دبائیں',
  },
  vqChooseAnswer: {
    en: 'Choose answer',
    ur: 'جواب چنیں',
  },
  vqClassAvg: {
    en: 'class average',
    ur: 'کلاس کا اوسط',
  },
  vqClassCardCaption: {
    en: '📊 Class results for *{topic}* — find yourself on the card.',
    ur: '‏📊 *{topic}* کے کلاس نتائج — کارڈ پر خود کو تلاش کریں۔',
  },
  vqClassEyebrow: {
    en: 'CLASS RESULTS',
    ur: 'کلاس کے نتائج',
  },
  vqClassFinished: {
    en: '{n} finished',
    ur: '‏{n} نے مکمل کیا',
  },
  vqClassMessage: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}*.\n\nTap here to start:\n{link}\n\nIt takes about 10 minutes. You\'ll need to type your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے۔\n\nشروع کرنے کے لیے یہاں tap کریں:\n{link}\n\nتقریباً 10 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  vqClassMessageCode: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}*.\n\nTo start, send this code to {bot}:\n*QUIZ-{code}*\n\nIt takes about 10 minutes. You\'ll need to type your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے۔\n\nشروع کرنے کے لیے {bot} کو یہ کوڈ بھیجیں:\n*QUIZ-{code}*\n\nتقریباً 10 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  vqClassMessageJoin: {
    en: '📚 *Quiz time!*\n\n{teacher} has sent you a quiz on *{topic}*.\n\nTo start, open a chat with {bot}:\n{link}\n\nand send this code:\n*QUIZ-{code}*\n\nIt takes about 10 minutes. You\'ll need to type your name and class first.',
    ur: '‏📚 *Quiz کا وقت!*\n\n{teacher} نے آپ کو *{topic}* پر quiz بھیجا ہے۔\n\nشروع کرنے کے لیے {bot} سے چیٹ کھولیں:\n{link}\n\nاور یہ کوڈ بھیجیں:\n*QUIZ-{code}*\n\nتقریباً 10 منٹ لگیں گے۔ پہلے آپ کا نام اور جماعت پوچھی جائے گی۔',
  },
  vqClassOthers: {
    en: '{n} more in the class',
    ur: 'کلاس کے {n} اور بچے',
  },
  vqClassOthersOne: {
    en: '{n} more in the class',
    ur: 'کلاس کا {n} اور بچہ',
  },
  vqClassPlace: {
    en: 'You came {place} of {n}',
    ur: '‏{n} میں سے آپ کا {place} نمبر',
  },
  vqClassPlaceTie: {
    en: 'You are joint {place} of {n}',
    ur: '‏{n} میں سے آپ مشترکہ {place} نمبر پر',
  },
  vqClassYou: {
    en: 'you',
    ur: 'آپ',
  },
  vqClassYours: {
    en: 'your score',
    ur: 'آپ کا اسکور',
  },
  vqCompareAhead: {
    en: 'You are still ahead. Nicely done.',
    ur: 'آپ اب بھی آگے ہیں۔ بہت خوب!',
  },
  vqCompareBehind: {
    en: '{them} edged you this time — worth another go.',
    ur: 'اس بار {them} کے نمبر زیادہ آئے — ایک بار اور کوشش کر کے دیکھیں!',
  },
  vqCompareMessage: {
    en: '🎯 *{them} finished your quiz!*\n\n{them}: *{theirs}/{outOf}*\nYou: *{mine}/{outOf}*\n\n{line}',
    ur: '‏🎯 *{them} نے آپ کا quiz مکمل کر لیا!*\n\n{them}: *{outOf} میں سے {theirs}*\nآپ: *{outOf} میں سے {mine}*\n\n{line}',
  },
  vqCompareTie: {
    en: 'A dead heat — you both got the same.',
    ur: 'برابر کا مقابلہ — دونوں کے نمبر ایک جیسے ہیں۔',
  },
  vqDoneFallback: {
    en: '🎉 All done!\n\nYou got *{correct} out of {total}* right ({pct}%).\n\n{tier}',
    ur: '🎉 مکمل!\n\nآپ نے *{total} میں سے {correct}* صحیح کیے ({pct}%)۔\n\n{tier}',
  },
  vqExpired: {
    en: 'That quiz link has expired. Ask your teacher for a new one!',
    ur: 'یہ quiz link ختم ہو چکا ہے۔ اپنے استاد سے نیا link لیں!',
  },
  vqGreeting: {
    en: '👋 Assalam o Alaikum!\n\n*{teacher}* has sent you a quiz on *{topic}*.',
    ur: '‏👋 السلام علیکم!\n\n*{teacher}* نے آپ کو *{topic}* پر quiz بھیجا ہے۔',
  },
  vqHereWeGo: {
    en: 'Here we go — {n} questions. Take your time!',
    ur: 'چلیں — {n} سوال ہیں۔ آرام سے کریں!',
  },
  vqInviteAsk: {
    en: 'Want to send this quiz to a friend?\n\nI’ll tell you how they did once they finish.',
    ur: 'یہ quiz کسی دوست کو بھیجیں؟\n\nجب وہ مکمل کر لیں تو آپ کو بتایا جائے گا کہ انہوں نے کیسا کیا۔',
  },
  vqInviteForwardThis: {
    en: 'Here is the message — forward THIS one to your friend:',
    ur: 'یہ رہا پیغام — یہی پیغام اپنے دوست کو forward کریں:',
  },
  vqInviteFriend: {
    en: 'Your friend',
    ur: 'آپ کے دوست',
  },
  vqInviteLinkFailed: {
    en: 'Sorry — I couldn\'t make that link just now. Try again in a moment.',
    ur: 'معذرت — ابھی link نہیں بن سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  vqInviteMessage: {
    en: '📚 *Try this quiz!*\n\n{name} thinks you\'d like this quiz on *{topic}*.\n\nTap here to start:\n{link}',
    ur: '‏📚 *یہ quiz کر کے دیکھیں!*\n\n{name} کے خیال میں *{topic}* پر یہ quiz آپ کو پسند آئے گا۔\n\nشروع کرنے کے لیے یہاں tap کریں:\n{link}',
  },
  vqInviteMessageCode: {
    en: '📚 *Try this quiz!*\n\n{name} thinks you\'d like this quiz on *{topic}*.\n\nTo start, send this code to {bot}:\n*QUIZ-{code}*',
    ur: '‏📚 *یہ quiz کر کے دیکھیں!*\n\n{name} کے خیال میں *{topic}* پر یہ quiz آپ کو پسند آئے گا۔\n\nشروع کرنے کے لیے {bot} کو یہ کوڈ بھیجیں:\n*QUIZ-{code}*',
  },
  vqInviteMessageJoin: {
    en: '📚 *Try this quiz!*\n\n{name} thinks you\'d like this quiz on *{topic}*.\n\nTo start, open a chat with {bot}:\n{link}\n\nand send this code:\n*QUIZ-{code}*',
    ur: '‏📚 *یہ quiz کر کے دیکھیں!*\n\n{name} کے خیال میں *{topic}* پر یہ quiz آپ کو پسند آئے گا۔\n\nشروع کرنے کے لیے {bot} سے چیٹ کھولیں:\n{link}\n\nاور یہ کوڈ بھیجیں:\n*QUIZ-{code}*',
  },
  vqInviteNo: {
    en: 'No thanks',
    ur: 'نہیں، شکریہ',
  },
  vqInviteYes: {
    en: 'Invite a friend',
    ur: 'دوست کو بھیجیں',
  },
  vqJoinClassHelp: {
    en: 'For example: Grade 4, or 1-B',
    ur: 'مثلاً: جماعت 4',
  },
  vqJoinClassLabel: {
    en: 'Your class',
    ur: 'آپ کی جماعت',
  },
  vqJoinFlowButton: {
    en: 'Start',
    ur: 'شروع کریں',
  },
  vqJoinHeading: {
    en: '{teacher} has sent you a quiz',
    ur: '‏{teacher} نے آپ کو quiz بھیجا ہے',
  },
  vqJoinNameHelp: {
    en: 'So your teacher can see how you did',
    ur: 'تاکہ آپ کے استاد دیکھ سکیں کہ آپ نے کیسا کیا',
  },
  vqJoinNameLabel: {
    en: 'Your name',
    ur: 'آپ کا نام',
  },
  vqJoinSubmit: {
    en: 'Start the quiz',
    ur: '‏quiz شروع کریں',
  },
  vqJoinTitle: {
    en: 'Before we start',
    ur: 'شروع کرنے سے پہلے',
  },
  vqLetsBegin: {
    en: 'Great — {who}. Let’s begin!',
    ur: 'بہت خوب — {who}۔ چلیں شروع کریں!',
  },
  vqLetsBeginName: {
    en: 'Let’s begin, {name}!',
    ur: '‏{name}، چلیں شروع کریں!',
  },
  vqLetterOr: {
    en: 'or',
    ur: 'یا',
  },
  vqLetterSep: {
    en: ', ',
    ur: '، ',
  },
  vqMoreAsk: {
    en: 'Want to watch more videos and take more quizzes?',
    ur: 'مزید ویڈیوز دیکھنی ہیں اور مزید quiz کرنے ہیں؟',
  },
  vqMoreDeclined: {
    en: 'No problem! You can watch more videos and take quizzes anytime — send /video and I’ll show you the menu.',
    ur: 'کوئی بات نہیں! کسی بھی وقت /video بھیج کر مزید ویڈیوز اور quiz حاصل کریں۔',
  },
  vqMoreFlowBody: {
    en: 'Pick a class, subject and topic — I will send the video to your chat.',
    ur: 'جماعت، مضمون اور موضوع چنیں — ویڈیو آپ کی chat میں بھیج دی جائے گی۔',
  },
  vqMoreFlowButton: {
    en: 'Browse',
    ur: 'دیکھیں',
  },
  vqMoreFlowHeader: {
    en: '🎬 More videos',
    ur: '🎬 مزید ویڈیوز',
  },
  vqMoreNo: {
    en: 'No thanks',
    ur: 'ابھی نہیں',
  },
  vqMoreUnavailable: {
    en: 'Sorry — picking more videos isn’t available right now. Send /video in a bit and I’ll show you the menu.',
    ur: 'معذرت — ابھی مزید ویڈیوز دستیاب نہیں۔ تھوڑی دیر میں /video بھیجیں۔',
  },
  vqMoreYes: {
    en: 'Watch more',
    ur: 'مزید دیکھیں',
  },
  vqMultiCardFoot: {
    en: 'Open the form below and tick every right answer.',
    ur: 'نیچے فارم کھولیں اور ہر درست جواب پر نشان لگائیں۔',
  },
  vqMultiCta: {
    en: 'Answer',
    ur: 'جواب دیں',
  },
  vqMultiExtra: {
    en: '{extra} does not belong here.',
    ur: '‏{extra} اس میں شامل نہیں۔',
  },
  vqMultiFallbackAsk: {
    en: 'More than one answer is right — tap the one you are most sure of.',
    ur: 'ایک سے زیادہ جواب درست ہیں — جس پر آپ کو سب سے زیادہ یقین ہے وہ دبائیں۔',
  },
  vqMultiFooter: {
    en: 'More than one answer is right.',
    ur: 'ایک سے زیادہ جواب درست ہیں۔',
  },
  vqMultiJoin: {
    en: ' and ',
    ur: ' اور ',
  },
  vqMultiMissed: {
    en: 'You missed {missed}.',
    ur: 'یہ بھی درست ہیں: {missed}۔',
  },
  vqMultiRight: {
    en: 'Correct! The full answer is {right}.',
    ur: 'درست! پورا جواب یہ ہے: {right}۔',
  },
  vqMultiSelectAll: {
    en: 'Select all that apply.',
    ur: 'سب درست جواب چنیں۔',
  },
  vqMultiSubmit: {
    en: 'Send answer',
    ur: 'جواب بھیجیں',
  },
  vqMultiTypeAsk: {
    en: 'More than one answer is right. Reply with every right letter, for example: A C',
    ur: '‏ایک سے زیادہ جواب درست ہیں۔ ہر درست جواب کا حرف لکھ کر بھیجیں، مثلاً: A C',
  },
  vqMultiTypeReask: {
    en: 'Please reply with every right letter from {letters}, for example: A C. To end the quiz, reply STOP.',
    ur: '‏براہِ کرم {letters} میں سے ہر درست جواب کا حرف لکھ کر بھیجیں، مثلاً: A C۔ quiz ختم کرنے کے لیے STOP لکھیں۔',
  },
  vqMultiWrong: {
    en: 'Not quite — the full answer is {right}.',
    ur: 'بالکل نہیں — پورا جواب یہ ہے: {right}۔',
  },
  vqNoQuestions: {
    en: 'Sorry — I couldn’t load that quiz just now. Please try again later.',
    ur: 'معذرت — ابھی یہ quiz لوڈ نہیں ہو سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  vqOfferDeclined: {
    en: 'No problem — enjoy the video!',
    ur: 'کوئی بات نہیں — ویڈیو دیکھنے کا لطف اٹھائیں!',
  },
  vqOfferExpired: {
    en: 'That quiz offer has expired — pick the video again and I\'ll offer it fresh.',
    ur: 'اس quiz کی پیشکش ختم ہو چکی ہے — ویڈیو دوبارہ چنیں، quiz نئے سرے سے پیش کیا جائے گا۔',
  },
  vqOptions: {
    en: 'Options',
    ur: 'جوابات',
  },
  vqQuestionOf: {
    en: '*Question {i} of {n}*',
    ur: '*سوال {i} از {n}*',
  },
  vqQuestionSkipped: {
    en: 'I couldn’t send question {i}, so I’ve skipped it.',
    ur: 'سوال {i} نہیں بھیجا جا سکا، اس لیے اسے چھوڑ دیا گیا ہے۔',
  },
  vqQuizFinished: {
    en: 'That quiz has finished. Pick another video and I\'ll offer you a fresh one!',
    ur: 'یہ quiz ختم ہو چکا ہے۔ کوئی اور ویڈیو چنیں، اس کے ساتھ نیا quiz ملے گا!',
  },
  vqReplyNumber: {
    en: 'Please reply with just the number — 1 to {n}.',
    ur: 'براہِ کرم صرف نمبر لکھیں — 1 سے {n} تک۔',
  },
  vqReportNoOne: {
    en: 'No one has opened your quiz on “{topic}” yet. The link stays live for 30 days — worth a nudge in the class group.',
    ur: '‏آپ کے quiz «{topic}» کو ابھی تک کسی نے نہیں کھولا۔ link 30 دن تک چلتا رہے گا — class group میں ایک بار پھر یاد دہانی کرا دیں۔',
  },
  vqScoreCaption: {
    en: '🎉 All done!\n\nYou got *{correct} out of {total}* right ({pct}%). {starsLine}\n\n{tier}',
    ur: '🎉 مکمل!\n\nآپ نے *{total} میں سے {correct}* صحیح کیے ({pct}%)۔ {starsLine}\n\n{tier}',
  },
  vqScorecardEyebrow: {
    en: 'QUIZ COMPLETE',
    ur: 'کوئز مکمل',
  },
  vqSelfTestStart: {
    en: 'This is your own test run — it won’t show up in your class report. Here goes!',
    ur: '‏یہ آپ کا اپنا test run ہے — یہ آپ کی کلاس رپورٹ میں شامل نہیں ہوگا۔ چلیں شروع کریں!',
  },
  vqShareDeclined: {
    en: 'No problem — it will be here when you want it.',
    ur: 'کوئی بات نہیں — جب چاہیں، یہ یہیں ملے گا۔',
  },
  vqShareForwardThis: {
    en: 'Here is your class message — forward THIS one to your class group:',
    ur: 'یہ رہا کلاس کا پیغام — یہی پیغام class group میں forward کریں:',
  },
  vqShareLinkFailed: {
    en: 'Sorry — I couldn\'t create the class link just now. Try again in a moment.',
    ur: 'معذرت — ابھی کلاس کا link نہیں بن سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  vqShareNo: {
    en: 'Not now',
    ur: 'ابھی نہیں',
  },
  vqShareOffer: {
    en: 'Want to send this quiz to your class?\n\nI\'ll give you one message to forward. Each child gets the quiz in their own chat, and you\'ll get their results in the morning.',
    ur: 'یہ quiz اپنی کلاس کو بھیجیں؟\n\nآپ کو forward کرنے کے لیے ایک پیغام ملے گا۔ ہر بچے کو quiz اس کی اپنی chat میں ملے گا، اور صبح آپ کو ان کے نتائج مل جائیں گے۔',
  },
  vqShareReportPromise: {
    en: 'You\'ll get a report on how your class did about 12 hours after the first student starts (at {hour}:00 if that falls at night).',
    ur: 'پہلے طالب علم کے شروع کرنے کے تقریباً 12 گھنٹے بعد کلاس کی رپورٹ آئے گی (اگر یہ وقت رات کا ہو تو {hour} بجے)۔',
  },
  vqShareReportPromiseAnytime: {
    en: 'You\'ll get a report on how your class did about 12 hours after the first student starts.',
    ur: 'پہلے طالب علم کے شروع کرنے کے تقریباً 12 گھنٹے بعد کلاس کی رپورٹ آئے گی۔',
  },
  vqShareYes: {
    en: 'Share with class',
    ur: 'کلاس کو بھیجیں',
  },
  vqStarsEarned: {
    en: 'You’ve earned {stars} stars!',
    ur: 'آپ کو {stars} ستارے ملے!',
  },
  vqStarsEarnedOne: {
    en: 'You’ve earned {stars} star!',
    ur: 'آپ کو {stars} ستارہ ملا!',
  },
  vqStartFailed: {
    en: 'Sorry — I couldn\'t start that quiz. Please try again in a moment.',
    ur: 'معذرت — ابھی یہ quiz شروع نہیں ہو سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  vqStillInQuiz: {
    en: 'You’re in the middle of a quiz — tap an answer to the question above, or type its letter. Type STOP to end the quiz.',
    ur: 'ابھی ایک quiz چل رہا ہے — اوپر والے سوال کا جواب tap کریں، یا اس کا حرف لکھیں۔ quiz ختم کرنے کے لیے STOP لکھیں۔',
  },
  vqStopped: {
    en: 'Okay, I’ve stopped this quiz here. You can start it again later.',
    ur: 'ٹھیک ہے، یہ quiz یہیں روک دیا گیا ہے۔ اسے بعد میں دوبارہ شروع کیا جا سکتا ہے۔',
  },
  vqTierDeveloping: {
    en: 'Nicely done — a little more practice and you’ll have it.',
    ur: 'بہت اچھا — تھوڑی اور مشق سے یہ پکا ہو جائے گا۔',
  },
  vqTierMastered: {
    en: 'Brilliant work!',
    ur: 'زبردست!',
  },
  vqTierNeedsPractice: {
    en: 'Good effort — this one is worth another go.',
    ur: 'اچھی کوشش — یہ دوبارہ کرنے کے قابل ہے۔',
  },
  vqTodaysVideo: {
    en: 'today’s video',
    ur: 'آج کی ویڈیو',
  },
  vqTrouble: {
    en: 'I’m having trouble sending the questions right now, so this quiz has stopped here. Please try it again a little later.',
    ur: 'ابھی سوال بھیجنے میں مسئلہ ہو رہا ہے، اس لیے یہ quiz یہیں روک دیا گیا ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  vqTypedAsk: {
    en: 'Reply with {letters}.',
    ur: '‏جواب میں {letters} لکھ کر بھیجیں۔',
  },
  vqTypedReask: {
    en: 'Please reply with just one letter: {letters}. To end the quiz, reply STOP.',
    ur: '‏براہِ کرم صرف ایک حرف لکھ کر بھیجیں: {letters}۔ quiz ختم کرنے کے لیے STOP لکھیں۔',
  },
  vqWelcomeBack: {
    en: 'Good to see you again, {name} — let’s begin!',
    ur: '‏{name}، آپ کو دوبارہ دیکھ کر خوشی ہوئی — چلیں شروع کریں!',
  },
  vqWhoIsTaking: {
    en: 'Who is taking it today?\n\n{names}\n{n}. Someone else\n\nReply with the number.',
    ur: 'آج کون quiz دے رہا ہے؟\n\n{names}\n{n}. کوئی اور\n\nنمبر لکھ کر جواب دیں۔',
  },
  vqWhoNameClass: {
    en: '⁨{name}⁩, ⁨{cls}⁩',
    ur: '⁨{name}⁩، ⁨{cls}⁩',
  },
};

/**
 * Grade and subject display labels, keyed by canonical codes. Every label fits the
 * 20-code-point button cap, the tightest teacher-facing field.
 */
const GRADE_LABELS = {
  early_years: { en: 'Early Years (KG)', ur: 'ابتدائی سال' },
  grade_1: { en: 'Grade 1', ur: 'جماعت اول' },
  grade_2: { en: 'Grade 2', ur: 'جماعت دوم' },
  grade_3: { en: 'Grade 3', ur: 'جماعت سوم' },
  grade_4: { en: 'Grade 4', ur: 'جماعت چہارم' },
  grade_5: { en: 'Grade 5', ur: 'جماعت پنجم' },
  grade_6: { en: 'Grade 6', ur: 'جماعت ششم' },
  grade_7: { en: 'Grade 7', ur: 'جماعت ہفتم' },
  grade_8: { en: 'Grade 8', ur: 'جماعت ہشتم' },
  grade_9: { en: 'Grade 9', ur: 'جماعت نہم' },
  grade_10: { en: 'Grade 10', ur: 'جماعت دہم' },
  grade_11: { en: 'Grade 11', ur: 'جماعت یازدہم' },
  grade_12: { en: 'Grade 12', ur: 'جماعت دوازدہم' },
};

const SUBJECT_LABELS = {
  urdu: { en: 'Urdu', ur: 'اردو' },
  english: { en: 'English', ur: 'انگریزی' },
  maths: { en: 'Mathematics', ur: 'ریاضی' },
  science: { en: 'General Science', ur: 'سائنس' },
  social_studies: { en: 'Social Studies', ur: 'معاشرتی علوم' },
  general_knowledge: { en: 'General Knowledge', ur: 'عمومی معلومات' },
};

/**
 * Look up a label from one of the maps above.
 * @returns {string|null} null for an unknown code
 */
function labelFrom(map, code, who) {
  const variants = map[code];
  if (!variants) return null;
  const lang = clampLanguage(typeof who === 'string' ? who : who?.preferred_language);
  return variants[lang] ?? variants[FLOOR];
}

function gradeLabelFor(code, who) {
  return labelFrom(GRADE_LABELS, code, who);
}

function subjectLabelFor(code, who) {
  return labelFrom(SUBJECT_LABELS, code, who);
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Resolve one catalogue key.
 *
 * Throws on an unknown key or a missing parameter. That is deliberate: the
 * alternative — the empty string, or the literal `{lesson}` — reaches a teacher
 * silently and nothing downstream notices. A throw surfaces in test.
 *
 * @param {string} key
 * @param {object} opts
 * @param {object} [opts.user] a users row; preferred_language is read from it
 * @param {string} [opts.language] explicit language, wins over user
 * @param {object} [opts.params] values for {placeholders}
 */
function resolveUx(key, { user, language, params } = {}) {
  const variants = UX_STRINGS[key];
  if (!variants) {
    throw new Error(`resolveUx: unknown string key "${key}"`);
  }

  const lang = clampLanguage(language || user?.preferred_language);
  const template = variants[lang] ?? variants[FLOOR];
  const valueOf = (name) => {
    const value = params?.[name];
    if (value === undefined || value === null) {
      throw new Error(`resolveUx: missing param "${name}" for key "${key}"`);
    }
    return String(value);
  };

  const dir = isRTL(lang) ? 'rtl' : 'ltr';
  return template.split('\n').map((para) => keepDirection(para, dir, valueOf)).join('\n');
}

// ─── paragraph direction ────────────────────────────────────────────────────
//
// A phone lays out each PARAGRAPH (each line after a newline) from its first
// strong character; a U+200F at the start of a string governs only its first
// paragraph. So a paragraph the author wrote in Urdu but OPENED with a
// placeholder — "{teacher} نے آپ کو …" — was laid out left to right whenever the
// value was Latin, and the reader started from the wrong end. English has the
// mirror case with an Urdu-script name. keepDirection() repairs exactly that,
// and nothing else: when the value that opens a paragraph would turn it the
// wrong way, the value is isolated and the paragraph opens with the language's
// own mark — the isolate for clients that honour it, the mark for those that do
// not. It never touches the author's own words (a line they open with a Latin
// word is theirs to mark, and a catalog test holds them to it), a line that is
// only a value (a link, a list of names), or a value the template or the caller
// already isolates.
const DIR_MARK = { rtl: '‏', ltr: '‎' };
const FSI = '⁨';
const PDI = '⁩';
const ISOLATE_OPEN = /[⁦-⁨]/;
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const ONE_PLACEHOLDER = /\{(\w+)\}/;

function strongDirection(ch) {
  if (ch === '‏' || ch === '؜') return 'rtl';
  if (ch === '‎') return 'ltr';
  if (!/\p{L}/u.test(ch)) return null;   // digits, punctuation, emoji, bidi controls
  return RTL_LETTER.test(ch) ? 'rtl' : 'ltr';
}

/** The first strong direction in `text`, NOT skipping isolates — what the least capable client sees. */
function firstStrong(text) {
  for (const ch of text) {
    const d = strongDirection(ch);
    if (d) return d;
  }
  return null;
}

/**
 * Is `value` a run of the OTHER script that is safe to isolate? A word of it
 * (two letters or more), none of this paragraph's script, not a URL (a mark
 * glued to a link can be swallowed into it), not already isolated. The word
 * rule keeps letter lists ("B، C") out: isolated, they would read left to right
 * inside an Urdu line.
 */
function isolatable(value, dir) {
  if (!value || ISOLATE_OPEN.test(value[0]) || /^\s*[a-z][\w+.-]*:\/\//i.test(value)) return false;
  const letters = [...value].map(strongDirection).filter(Boolean);
  if (letters.includes(dir)) return false;
  const word = dir === 'rtl'
    ? /(?:(?![֐-ࣿיִ-﷿ﹰ-﻿])\p{L}){2,}/u
    : /(?:(?=[֐-ࣿיִ-﷿ﹰ-﻿])\p{L}){2,}/u;
  return word.test(value);
}

function keepDirection(para, dir, valueOf) {
  const filled = para.replace(PLACEHOLDER, (_, name) => valueOf(name));
  const first = para.search(ONE_PLACEHOLDER);
  if (first < 0) return filled;                                   // the author's words alone
  const lead = para.slice(0, first);
  if (firstStrong(lead) !== null) return filled;                  // the author's words lead
  const own = para.replace(PLACEHOLDER, '');
  if (![...own].some((ch) => strongDirection(ch) === dir)) return filled;   // a line of values only
  if (firstStrong(filled) === dir) return filled;                 // the value already reads this way

  const templateIsolates = ISOLATE_OPEN.test(lead.slice(-1));
  let opened = false;
  const out = para.replace(PLACEHOLDER, (_, name) => {
    const value = valueOf(name);
    if (opened) return value;
    opened = true;
    return !templateIsolates && isolatable(value, dir) ? `${FSI}${value}${PDI}` : value;
  });
  return `${DIR_MARK[dir]}${out}`;
}

/** The English name of a language, for prompts and labels ("Urdu", "Kiswahili"…). */
function languageLabelFor(code) {
  return getEnglishName(code) || 'English';
}

module.exports = {
  UX_STRINGS,
  CATALOGUE_LANGUAGES,
  resolveUx,
  clampLanguage,
  languageLabelFor,
  GRADE_LABELS,
  SUBJECT_LABELS,
  gradeLabelFor,
  subjectLabelFor,
  FLOOR,
};
