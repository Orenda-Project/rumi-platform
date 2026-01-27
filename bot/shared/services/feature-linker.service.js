/**
 * Feature Linker Service
 * Suggests next logical feature after completing one
 *
 * Flow:
 * - Lesson Plan → Coaching (40%) or Reading (25%)
 * - Coaching → Reading (50%) or Lesson Plan (30%)
 * - Reading → Lesson Plan (60%)
 *
 * Integration Point 1: After feature completion with CONSENT
 * - If user hasn't seen intro video → ask via button before showing
 * - If user has seen video → just send text suggestion
 *
 * Supported Languages: EN, UR, AR, ES (all 4 core languages)
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const WhatsAppService = require('./whatsapp.service');
const FeatureIntroService = require('./feature-intro.service');
const { FEATURE_VIDEO_URLS, FEATURE_CONSENT_MESSAGES, CONSENT_BUTTON_LABELS } = require('../constants/feature-videos');
const redisService = require('./cache/railway-redis.service');

/**
 * Feature linking matrix with probabilities and messages
 * ALL 4 CORE LANGUAGES: English, Urdu, Arabic, Spanish
 */
const FEATURE_LINKS = {
  lesson_plan: [
    {
      feature: 'coaching',
      probability: 0.40,
      messages: {
        en: "🎯 *Pro tip*: When you teach this lesson, send me an audio recording of your class! I'll analyze your teaching and give you personalized feedback.",
        ur: "🎯 *ٹپ*: جب آپ یہ سبق پڑھائیں، مجھے اپنی کلاس کی آڈیو ریکارڈنگ بھیجیں! میں آپ کی تدریس کا تجزیہ کر کے فیڈبیک دوں گی۔",
        ar: "🎯 *نصيحة*: عندما تدرّس هذا الدرس، أرسل لي تسجيلاً صوتياً لفصلك! سأحلل تدريسك وأقدم لك ملاحظات مخصصة.",
        es: "🎯 *Consejo*: Cuando enseñes esta lección, ¡envíame una grabación de audio de tu clase! Analizaré tu enseñanza y te daré retroalimentación personalizada."
      }
    },
    {
      feature: 'reading',
      probability: 0.25,
      messages: {
        en: "📚 After this lesson, want to test if your students can read the key vocabulary? Type /reading test to assess their reading fluency!",
        ur: "📚 اس سبق کے بعد، کیا آپ چیک کرنا چاہتے ہیں کہ طلباء اہم الفاظ پڑھ سکتے ہیں؟ /reading test ٹائپ کریں!",
        ar: "📚 بعد هذا الدرس، هل تريد اختبار ما إذا كان طلابك يستطيعون قراءة المفردات الأساسية؟ اكتب /reading test لتقييم طلاقتهم في القراءة!",
        es: "📚 Después de esta lección, ¿quieres probar si tus estudiantes pueden leer el vocabulario clave? ¡Escribe /reading test para evaluar su fluidez lectora!"
      }
    }
  ],
  coaching: [
    {
      feature: 'reading',
      probability: 0.50,
      messages: {
        // FYI-style introduction - not implying coaching reveals reading needs
        en: "📖 By the way, I can also assess your students' reading fluency! Want to try it? Type /reading test",
        ur: "📖 ویسے، میں آپ کے طلباء کی ریڈنگ روانی بھی جانچ سکتی ہوں! آزمانا چاہتے ہیں؟ /reading test ٹائپ کریں",
        ar: "📖 بالمناسبة، يمكنني أيضاً تقييم طلاقة القراءة لدى طلابك! هل تريد تجربتها؟ اكتب /reading test",
        es: "📖 Por cierto, ¡también puedo evaluar la fluidez lectora de tus estudiantes! ¿Quieres probarlo? Escribe /reading test"
      }
    },
    {
      feature: 'lesson_plan',
      probability: 0.30,
      messages: {
        en: "💡 Based on this feedback, want me to create a follow-up lesson plan to address these areas?",
        ur: "💡 اس فیڈبیک کی بنیاد پر، کیا میں ان نکات پر فالو اپ لیسن پلان بناؤں؟",
        ar: "💡 بناءً على هذه الملاحظات، هل تريدني أن أنشئ خطة درس متابعة لمعالجة هذه المجالات؟",
        es: "💡 Según esta retroalimentación, ¿quieres que cree un plan de lección de seguimiento para abordar estas áreas?"
      }
    }
  ],
  reading: [
    {
      feature: 'lesson_plan',
      probability: 0.60,
      messages: {
        en: "📝 Based on these reading results, I can create a targeted lesson plan to improve these skills. Want me to create one?",
        ur: "📝 ان ریڈنگ نتائج کی بنیاد پر، میں ان مہارتوں کو بہتر بنانے کے لیے ایک ٹارگٹڈ لیسن پلان بنا سکتی ہوں۔ بناؤں؟",
        ar: "📝 بناءً على نتائج القراءة هذه، يمكنني إنشاء خطة درس موجهة لتحسين هذه المهارات. هل تريدني أن أنشئ واحدة؟",
        es: "📝 Según estos resultados de lectura, puedo crear un plan de lección específico para mejorar estas habilidades. ¿Quieres que cree uno?"
      }
    }
  ]
};

/**
 * Map regional languages to their fallback language for messages
 * Pakistani regional languages fall back to Urdu
 */
const LANGUAGE_FALLBACK_MAP = {
  'pa-PK': 'ur',  // Punjabi → Urdu
  'sd-PK': 'ur',  // Sindhi → Urdu
  'ps-PK': 'ur',  // Pashto → Urdu
  'bal-PK': 'ur', // Balochi → Urdu
  'ta-LK': 'en',  // Tamil → English (for now)
};

class FeatureLinkerService {
  /**
   * Get the best available language for messages
   * Falls back to Urdu for Pakistani regional languages, then to English
   * @private
   */
  static _getMessageLanguage(language, availableLanguages) {
    // Direct match
    if (availableLanguages.includes(language)) {
      return language;
    }
    // Check fallback map
    const fallback = LANGUAGE_FALLBACK_MAP[language];
    if (fallback && availableLanguages.includes(fallback)) {
      return fallback;
    }
    // Default to English
    return 'en';
  }

  /**
   * Suggest next feature after completing one
   * Integration Point 1: With CONSENT for video introduction
   *
   * @param {string} completedFeature - Feature just completed ('lesson_plan', 'coaching', 'reading')
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @param {Object} context - Optional context (e.g., lesson topic, coaching insights)
   */
  static async suggestNext(completedFeature, userId, phoneNumber, language = 'en', context = {}) {
    try {
      const links = FEATURE_LINKS[completedFeature];
      if (!links || links.length === 0) {
        logToFile('No feature links for completed feature', { completedFeature });
        return;
      }

      // Get user's feature history
      const userHistory = await this._getUserFeatureHistory(userId);

      // Find a feature to suggest
      for (const link of links) {
        // Skip if user has used this feature recently (within 7 days)
        const historyKey = `last${this._capitalize(link.feature)}DaysAgo`;
        if (userHistory[historyKey] < 7) {
          logToFile('Skipping link - user recently used feature', {
            feature: link.feature,
            daysAgo: userHistory[historyKey]
          });
          continue;
        }

        // Roll the dice
        if (Math.random() < link.probability) {
          // Get best available language (with fallback for regional languages)
          const availableLanguages = Object.keys(link.messages);
          const messageLanguage = this._getMessageLanguage(language, availableLanguages);
          const textMessage = link.messages[messageLanguage];

          logToFile('🔗 Feature link triggered', {
            from: completedFeature,
            to: link.feature,
            probability: link.probability,
            userId
          });

          // Small delay so it feels natural
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Check if user has seen the intro video for this feature
          const hasSeenVideo = await FeatureIntroService.hasSeenIntroVideo(userId, link.feature);

          if (hasSeenVideo) {
            // User already saw video, just send text suggestion
            logToFile('📝 User already saw video, sending text only', { feature: link.feature });
            await WhatsAppService.sendMessage(phoneNumber, textMessage);
          } else {
            // User hasn't seen video - ask for consent via interactive buttons
            logToFile('🎥 Asking consent for feature video', { feature: link.feature });

            // Get consent message in user's language
            const consentMessage = FEATURE_CONSENT_MESSAGES[link.feature]?.[messageLanguage]
              || FEATURE_CONSENT_MESSAGES[link.feature]?.en
              || `I have another feature that might help! Want to see how it works? 🎥`;

            // Get button labels in user's language
            const showMeLabel = CONSENT_BUTTON_LABELS.show_video[messageLanguage]
              || CONSENT_BUTTON_LABELS.show_video.en;
            const laterLabel = CONSENT_BUTTON_LABELS.maybe_later[messageLanguage]
              || CONSENT_BUTTON_LABELS.maybe_later.en;

            // Store pending consent state in Redis (expires in 1 hour)
            const consentKey = `feature_consent:${userId}`;
            await redisService.redis.setex(consentKey, 3600, JSON.stringify({
              suggestedFeature: link.feature,
              fromFeature: completedFeature,
              textMessage: textMessage,
              language: messageLanguage,
              phoneNumber: phoneNumber,
              createdAt: new Date().toISOString()
            }));

            // Send interactive buttons
            await WhatsAppService.sendInteractiveButtons(phoneNumber, {
              body: consentMessage,
              buttons: [
                { id: `show_feature_video_${link.feature}`, title: showMeLabel },
                { id: `skip_feature_video_${link.feature}`, title: laterLabel }
              ]
            });
          }

          // Log for analytics
          await this._logFeatureLink(userId, completedFeature, link.feature, true);

          return; // Only suggest one feature
        }
      }

      logToFile('No feature link triggered (probability roll)', { completedFeature });
    } catch (error) {
      logToFile('Error in feature linker', { error: error.message, completedFeature });
    }
  }

  /**
   * Handle button response for feature video consent
   * Called from interactive-message.handler.js when user clicks a button
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} buttonId - Button ID clicked (e.g., 'show_feature_video_coaching')
   * @returns {Promise<boolean>} True if handled, false if not a feature consent button
   */
  static async handleConsentButtonResponse(userId, phoneNumber, buttonId) {
    try {
      // Check if this is a feature video consent button
      if (!buttonId.startsWith('show_feature_video_') && !buttonId.startsWith('skip_feature_video_')) {
        return false; // Not a feature consent button
      }

      // Get pending consent state from Redis
      const consentKey = `feature_consent:${userId}`;
      const consentData = await redisService.redis.get(consentKey);

      if (!consentData) {
        logToFile('⚠️ No pending consent found for user', { userId, buttonId });
        return false;
      }

      const consent = JSON.parse(consentData);
      const { suggestedFeature, textMessage, language } = consent;

      // Extract feature from button ID
      const isShowVideo = buttonId.startsWith('show_feature_video_');
      const featureFromButton = buttonId.replace('show_feature_video_', '').replace('skip_feature_video_', '');

      // Verify it matches the pending consent
      if (featureFromButton !== suggestedFeature) {
        logToFile('⚠️ Button feature mismatch', { buttonFeature: featureFromButton, pendingFeature: suggestedFeature });
        return false;
      }

      // Clear the pending consent
      await redisService.redis.del(consentKey);

      if (isShowVideo) {
        // User wants to see the video
        logToFile('📹 User consented to feature video', { feature: suggestedFeature, userId });

        // Get video URL
        const videoUrl = FEATURE_VIDEO_URLS[suggestedFeature];
        if (videoUrl) {
          // Send video
          await WhatsAppService.sendVideoFromUrl(phoneNumber, videoUrl);

          // Mark video as shown
          await FeatureIntroService.markVideoShown(userId, suggestedFeature);

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Send the text suggestion
        await WhatsAppService.sendMessage(phoneNumber, textMessage);

        // Log consent accepted
        await this._logFeatureConsentResponse(userId, suggestedFeature, true);
      } else {
        // User declined video
        logToFile('⏭️ User skipped feature video', { feature: suggestedFeature, userId });

        // Still send the text suggestion (just no video)
        await WhatsAppService.sendMessage(phoneNumber, textMessage);

        // Log consent declined
        await this._logFeatureConsentResponse(userId, suggestedFeature, false);
      }

      return true;
    } catch (error) {
      logToFile('❌ Error handling consent button response', { error: error.message, buttonId });
      return false;
    }
  }

  /**
   * Log feature consent response
   * @private
   */
  static async _logFeatureConsentResponse(userId, feature, acceptedVideo) {
    try {
      await supabase.from('feature_suggestions').insert({
        user_id: userId,
        suggested_feature: feature,
        trigger_type: 'link_consent',
        was_shown: true,
        was_clicked: acceptedVideo,
        message_context: acceptedVideo ? 'User accepted video' : 'User skipped video'
      });
    } catch (error) {
      logToFile('Error logging feature consent response', { error: error.message });
    }
  }

  /**
   * Get user's feature usage history
   * @private
   */
  static async _getUserFeatureHistory(userId) {
    try {
      const now = new Date();

      const { data: lessonPlans } = await supabase
        .from('lesson_plans')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: coachingSessions } = await supabase
        .from('coaching_sessions')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: readingAssessments } = await supabase
        .from('reading_assessments')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const daysSince = (date) => {
        if (!date) return Infinity;
        return (now - new Date(date)) / (1000 * 60 * 60 * 24);
      };

      return {
        lastLessonPlanDaysAgo: daysSince(lessonPlans?.[0]?.created_at),
        lastCoachingDaysAgo: daysSince(coachingSessions?.[0]?.created_at),
        lastReadingDaysAgo: daysSince(readingAssessments?.[0]?.created_at)
      };
    } catch (error) {
      logToFile('Error getting user feature history for linker', { error: error.message });
      return {};
    }
  }

  /**
   * Capitalize first letter of each word
   * @private
   */
  static _capitalize(str) {
    return str.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
  }

  /**
   * Log feature link event
   * @private
   */
  static async _logFeatureLink(userId, fromFeature, toFeature, wasShown) {
    try {
      await supabase.from('feature_suggestions').insert({
        user_id: userId,
        suggested_feature: toFeature,
        trigger_type: 'link',
        confidence_score: null,
        message_context: `After completing ${fromFeature}`,
        was_shown: wasShown
      });
    } catch (error) {
      logToFile('Error logging feature link', { error: error.message });
    }
  }
}

module.exports = FeatureLinkerService;
