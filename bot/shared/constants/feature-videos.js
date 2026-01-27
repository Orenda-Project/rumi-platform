/**
 * Feature Introduction Video URLs
 * Hosted on Cloudflare R2 storage
 *
 * These videos are shown to users:
 * 1. On first use of a slash command (implicit consent)
 * 2. After feature completion with consent (explicit consent via buttons)
 * 3. When keywords are detected in chat (explicit consent via buttons)
 */

const R2_BASE = process.env.R2_PUBLIC_URL || '';

const FEATURE_VIDEO_URLS = {
  lesson_plan: `${R2_BASE}/feature_videos/lesson_plan_intro.mp4`,
  coaching: `${R2_BASE}/feature_videos/coaching_intro.mp4`,
  reading: `${R2_BASE}/feature_videos/reading_intro.mp4`,
};

/**
 * Consent messages for feature discovery (multilingual)
 * Used when asking users if they want to see a feature introduction video
 */
const FEATURE_CONSENT_MESSAGES = {
  coaching: {
    en: "I can help you improve your teaching! Want to see how? 🎥",
    ur: "میں آپ کی تدریس بہتر بنانے میں مدد کر سکتی ہوں! دیکھنا چاہتے ہیں؟ 🎥",
    ar: "يمكنني مساعدتك في تحسين تدريسك! هل تريد أن ترى كيف؟ 🎥",
    es: "¡Puedo ayudarte a mejorar tu enseñanza! ¿Quieres ver cómo? 🎥"
  },
  reading: {
    en: "I can assess your students' reading fluency! Want to see how? 🎥",
    ur: "میں آپ کے طلباء کی ریڈنگ روانی جانچ سکتی ہوں! دیکھنا چاہتے ہیں؟ 🎥",
    ar: "يمكنني تقييم طلاقة القراءة لدى طلابك! هل تريد أن ترى كيف؟ 🎥",
    es: "¡Puedo evaluar la fluidez lectora de tus estudiantes! ¿Quieres ver cómo? 🎥"
  },
  lesson_plan: {
    en: "I can create detailed lesson plans for you! Want to see how? 🎥",
    ur: "میں آپ کے لیے تفصیلی لیسن پلان بنا سکتی ہوں! دیکھنا چاہتے ہیں؟ 🎥",
    ar: "يمكنني إنشاء خطط دروس مفصلة لك! هل تريد أن ترى كيف؟ 🎥",
    es: "¡Puedo crear planes de lección detallados para ti! ¿Quieres ver cómo? 🎥"
  }
};

/**
 * First-use intro messages (shown before video on first slash command use)
 */
const FIRST_USE_INTRO_MESSAGES = {
  reading: {
    en: "Here's a quick look at how reading assessment works! 🎥",
    ur: "دیکھیں ریڈنگ اسیسمنٹ کیسے کام کرتی ہے! 🎥",
    ar: "إليك نظرة سريعة على كيفية عمل تقييم القراءة! 🎥",
    es: "¡Aquí tienes un vistazo rápido de cómo funciona la evaluación de lectura! 🎥"
  },
  lesson_plan: {
    en: "Here's a quick look at how lesson planning works! 🎥",
    ur: "دیکھیں لیسن پلان کیسے کام کرتا ہے! 🎥",
    ar: "إليك نظرة سريعة على كيفية عمل تخطيط الدروس! 🎥",
    es: "¡Aquí tienes un vistazo rápido de cómo funciona la planificación de lecciones! 🎥"
  },
  coaching: {
    en: "Here's a quick look at how classroom coaching works! 🎥",
    ur: "دیکھیں کلاس روم کوچنگ کیسے کام کرتی ہے! 🎥",
    ar: "إليك نظرة سريعة على كيفية عمل التدريب الصفي! 🎥",
    es: "¡Aquí tienes un vistazo rápido de cómo funciona el coaching de aula! 🎥"
  }
};

/**
 * Button labels for consent flow
 */
const CONSENT_BUTTON_LABELS = {
  show_video: {
    en: "Show me!",
    ur: "دکھائیں!",
    ar: "أرني!",
    es: "¡Muéstrame!"
  },
  maybe_later: {
    en: "Maybe later",
    ur: "بعد میں",
    ar: "ربما لاحقاً",
    es: "Quizás luego"
  },
  just_tell_me: {
    en: "Just tell me",
    ur: "بس بتائیں",
    ar: "فقط أخبرني",
    es: "Solo dime"
  }
};

module.exports = {
  FEATURE_VIDEO_URLS,
  FEATURE_CONSENT_MESSAGES,
  FIRST_USE_INTRO_MESSAGES,
  CONSENT_BUTTON_LABELS
};
