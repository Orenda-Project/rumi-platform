/**
 * Feature Keyword Detector Service
 * Integration Point 3: Detects feature-related keywords in user messages
 * and offers to show introduction videos with explicit consent
 *
 * This service:
 * 1. Scans user messages for feature keywords
 * 2. If keywords detected AND user hasn't seen the video → offer video via buttons
 * 3. Requires explicit consent (user must click button)
 */

const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const FeatureIntroService = require('./feature-intro.service');
const { FEATURE_VIDEO_URLS, CONSENT_BUTTON_LABELS } = require('../constants/feature-videos');
const redisService = require('./cache/railway-redis.service');

/**
 * Feature keywords matrix
 * - high: Strong indicators (score +0.5)
 * - medium: Moderate indicators (score +0.3)
 * - low: Weak indicators (score +0.1) - not used to avoid false positives
 */
const FEATURE_KEYWORDS = {
  reading: {
    high: [
      'reading test', 'reading assessment', 'fluency test', 'fluency assessment',
      'pronunciation test', 'wcpm', 'words per minute', 'reading fluency',
      'assess reading', 'test reading', 'reading level', 'oral reading'
    ],
    medium: [
      'test students reading', 'check reading', 'reading ability',
      'students read', 'how well they read', 'reading skills'
    ]
  },
  coaching: {
    high: [
      'classroom observation', 'classroom recording', 'teaching feedback',
      'analyze my class', 'analyze my teaching', 'coaching session',
      'observe my class', 'review my teaching', 'audio recording of class'
    ],
    medium: [
      'teaching tips', 'improve teaching', 'feedback on lesson',
      'how did i teach', 'teaching analysis', 'classroom audio'
    ]
  },
  lesson_plan: {
    high: [
      'lesson plan', 'create lesson', 'make a lesson plan', 'generate lesson',
      'plan a lesson', 'teaching plan', 'class plan'
    ],
    medium: [
      'prepare lesson', 'plan for tomorrow', 'teaching tomorrow',
      'what to teach', 'how to teach'
    ]
  }
};

/**
 * Consent messages when keywords are detected (multilingual)
 */
const KEYWORD_CONSENT_MESSAGES = {
  reading: {
    en: "I can assess reading fluency and comprehension! Would you like to see how it works? 🎥",
    ur: "میں ریڈنگ کی روانی اور سمجھ بوجھ جانچ سکتی ہوں! دیکھنا چاہتے ہیں کہ یہ کیسے کام کرتا ہے؟ 🎥",
    ar: "يمكنني تقييم طلاقة القراءة والفهم! هل تريد أن ترى كيف يعمل؟ 🎥",
    es: "¡Puedo evaluar la fluidez y comprensión lectora! ¿Te gustaría ver cómo funciona? 🎥"
  },
  coaching: {
    en: "I can analyze your classroom recordings and give feedback! Want to see how? 🎥",
    ur: "میں آپ کی کلاس روم ریکارڈنگ کا تجزیہ کر کے فیڈبیک دے سکتی ہوں! دیکھنا چاہتے ہیں کیسے؟ 🎥",
    ar: "يمكنني تحليل تسجيلات فصلك وتقديم ملاحظات! هل تريد أن ترى كيف؟ 🎥",
    es: "¡Puedo analizar las grabaciones de tu clase y darte retroalimentación! ¿Quieres ver cómo? 🎥"
  },
  lesson_plan: {
    en: "I can create detailed lesson plans for any topic! Want to see how? 🎥",
    ur: "میں کسی بھی موضوع کے لیے تفصیلی لیسن پلان بنا سکتی ہوں! دیکھنا چاہتے ہیں کیسے؟ 🎥",
    ar: "يمكنني إنشاء خطط دروس مفصلة لأي موضوع! هل تريد أن ترى كيف؟ 🎥",
    es: "¡Puedo crear planes de lección detallados para cualquier tema! ¿Quieres ver cómo? 🎥"
  }
};

/**
 * Language fallback map for regional languages
 */
const LANGUAGE_FALLBACK_MAP = {
  'pa-PK': 'ur',
  'sd-PK': 'ur',
  'ps-PK': 'ur',
  'bal-PK': 'ur',
  'ta-LK': 'en',
};

class FeatureKeywordDetectorService {
  /**
   * Get the best available language for messages
   * @private
   */
  static _getMessageLanguage(language) {
    const supportedLanguages = ['en', 'ur', 'ar', 'es'];
    if (supportedLanguages.includes(language)) {
      return language;
    }
    const fallback = LANGUAGE_FALLBACK_MAP[language];
    if (fallback && supportedLanguages.includes(fallback)) {
      return fallback;
    }
    return 'en';
  }

  /**
   * Calculate feature detection score for a message
   * @param {string} message - User message
   * @returns {Object} Scores for each feature
   */
  static calculateFeatureScores(message) {
    const lowerMessage = message.toLowerCase();
    const scores = { reading: 0, coaching: 0, lesson_plan: 0 };

    for (const [feature, keywords] of Object.entries(FEATURE_KEYWORDS)) {
      // High confidence keywords
      for (const keyword of keywords.high) {
        if (lowerMessage.includes(keyword)) {
          scores[feature] += 0.5;
          logToFile(`🔍 High keyword match: "${keyword}" for ${feature}`, { score: scores[feature] });
        }
      }

      // Medium confidence keywords
      for (const keyword of keywords.medium) {
        if (lowerMessage.includes(keyword)) {
          scores[feature] += 0.3;
          logToFile(`🔍 Medium keyword match: "${keyword}" for ${feature}`, { score: scores[feature] });
        }
      }
    }

    return scores;
  }

  /**
   * Get the highest scoring feature above threshold
   * @param {Object} scores - Feature scores
   * @param {number} threshold - Minimum score to trigger (default 0.5)
   * @returns {Object|null} { feature, score } or null if none above threshold
   */
  static getHighestFeatureAboveThreshold(scores, threshold = 0.5) {
    const entries = Object.entries(scores);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const highest = sorted[0];

    if (highest[1] >= threshold) {
      return { feature: highest[0], score: highest[1] };
    }
    return null;
  }

  /**
   * Detect feature keywords and offer intro video if appropriate
   * Returns true if detection was handled (video offered or already seen), false otherwise
   *
   * @param {string} message - User message
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @returns {Promise<boolean>} True if handled (should not proceed with normal flow)
   */
  static async detectAndOfferVideo(message, userId, phoneNumber, language = 'en') {
    try {
      // Calculate feature scores
      const scores = this.calculateFeatureScores(message);
      const detected = this.getHighestFeatureAboveThreshold(scores);

      if (!detected) {
        // No feature keywords detected above threshold
        return false;
      }

      logToFile('🎯 Feature keyword detected', {
        feature: detected.feature,
        score: detected.score,
        userId
      });

      // Check if user has already seen this feature's video
      const hasSeenVideo = await FeatureIntroService.hasSeenIntroVideo(userId, detected.feature);

      if (hasSeenVideo) {
        // User already saw video - don't offer again
        logToFile('📹 User already saw video, skipping offer', { feature: detected.feature });
        return false; // Allow normal flow to continue
      }

      // Check cooldown - don't offer same feature video within 24 hours
      const cooldownKey = `keyword_offer_cooldown:${userId}:${detected.feature}`;
      const cooldownExists = await redisService.redis.get(cooldownKey);

      if (cooldownExists) {
        logToFile('⏰ Keyword offer on cooldown', { feature: detected.feature, userId });
        return false;
      }

      // Get consent message in user's language
      const msgLanguage = this._getMessageLanguage(language);
      const consentMessage = KEYWORD_CONSENT_MESSAGES[detected.feature]?.[msgLanguage]
        || KEYWORD_CONSENT_MESSAGES[detected.feature]?.en
        || "I have a feature that might help! Want to see how it works? 🎥";

      // Get button labels in user's language
      const showMeLabel = CONSENT_BUTTON_LABELS.show_video[msgLanguage]
        || CONSENT_BUTTON_LABELS.show_video.en;
      const justTellMeLabel = CONSENT_BUTTON_LABELS.just_tell_me[msgLanguage]
        || CONSENT_BUTTON_LABELS.just_tell_me.en;

      // Store pending keyword consent in Redis (expires in 1 hour)
      const consentKey = `keyword_consent:${userId}`;
      await redisService.redis.setex(consentKey, 3600, JSON.stringify({
        detectedFeature: detected.feature,
        score: detected.score,
        originalMessage: message.substring(0, 200), // Store first 200 chars
        language: msgLanguage,
        phoneNumber: phoneNumber,
        createdAt: new Date().toISOString()
      }));

      // Set cooldown (24 hours)
      await redisService.redis.setex(cooldownKey, 86400, '1');

      // Send consent buttons
      await WhatsAppService.sendInteractiveButtons(phoneNumber, {
        body: consentMessage,
        buttons: [
          { id: `keyword_show_video_${detected.feature}`, title: showMeLabel },
          { id: `keyword_skip_video_${detected.feature}`, title: justTellMeLabel }
        ]
      });

      logToFile('📱 Keyword consent buttons sent', {
        feature: detected.feature,
        userId
      });

      // Return true - we handled it, caller should stop normal processing
      return true;
    } catch (error) {
      logToFile('❌ Error in keyword detection', { error: error.message, stack: error.stack });
      return false; // On error, allow normal flow to continue
    }
  }

  /**
   * Handle button response for keyword-triggered video consent
   * Called from whatsapp-bot.js when user clicks a button
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} buttonId - Button ID clicked
   * @returns {Promise<boolean>} True if handled, false if not a keyword consent button
   */
  static async handleKeywordConsentButton(userId, phoneNumber, buttonId) {
    try {
      // Check if this is a keyword consent button
      if (!buttonId.startsWith('keyword_show_video_') && !buttonId.startsWith('keyword_skip_video_')) {
        return false;
      }

      // Get pending keyword consent from Redis
      const consentKey = `keyword_consent:${userId}`;
      const consentData = await redisService.redis.get(consentKey);

      if (!consentData) {
        logToFile('⚠️ No pending keyword consent found', { userId, buttonId });
        return false;
      }

      const consent = JSON.parse(consentData);
      const { detectedFeature, language } = consent;

      // Extract feature from button ID
      const isShowVideo = buttonId.startsWith('keyword_show_video_');
      const featureFromButton = buttonId.replace('keyword_show_video_', '').replace('keyword_skip_video_', '');

      // Verify it matches
      if (featureFromButton !== detectedFeature) {
        logToFile('⚠️ Keyword button feature mismatch', {
          buttonFeature: featureFromButton,
          pendingFeature: detectedFeature
        });
        return false;
      }

      // Clear the pending consent
      await redisService.redis.del(consentKey);

      if (isShowVideo) {
        // User wants to see the video
        logToFile('📹 User accepted keyword video offer', { feature: detectedFeature, userId });

        // Get video URL
        const videoUrl = FEATURE_VIDEO_URLS[detectedFeature];
        if (videoUrl) {
          await WhatsAppService.sendVideoFromUrl(phoneNumber, videoUrl);
          await FeatureIntroService.markVideoShown(userId, detectedFeature);

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Send follow-up with command
        const followUpMessages = {
          reading: {
            en: "To start a reading assessment, type: /reading test",
            ur: "ریڈنگ اسیسمنٹ شروع کرنے کے لیے ٹائپ کریں: /reading test",
            ar: "لبدء تقييم القراءة، اكتب: /reading test",
            es: "Para comenzar una evaluación de lectura, escribe: /reading test"
          },
          coaching: {
            en: "To get coaching feedback, just send me an audio recording of your class!",
            ur: "کوچنگ فیڈبیک کے لیے، مجھے اپنی کلاس کی آڈیو ریکارڈنگ بھیجیں!",
            ar: "للحصول على ملاحظات التدريب، أرسل لي تسجيلاً صوتياً لفصلك!",
            es: "Para recibir retroalimentación de coaching, ¡envíame una grabación de audio de tu clase!"
          },
          lesson_plan: {
            en: "To create a lesson plan, just tell me what you want to teach! For example: 'Create a lesson plan for teaching fractions to grade 5'",
            ur: "لیسن پلان بنانے کے لیے، مجھے بتائیں آپ کیا پڑھانا چاہتے ہیں! مثال: 'گریڈ 5 کو فریکشن پڑھانے کا لیسن پلان بنائیں'",
            ar: "لإنشاء خطة درس، أخبرني فقط ماذا تريد أن تدرس! مثال: 'أنشئ خطة درس لتدريس الكسور للصف الخامس'",
            es: "Para crear un plan de lección, ¡solo dime qué quieres enseñar! Por ejemplo: 'Crea un plan de lección para enseñar fracciones a 5to grado'"
          }
        };

        const followUp = followUpMessages[detectedFeature]?.[language]
          || followUpMessages[detectedFeature]?.en;

        if (followUp) {
          await WhatsAppService.sendMessage(phoneNumber, followUp);
        }

        // Log acceptance
        await this._logKeywordConsent(userId, detectedFeature, true);
      } else {
        // User declined video - just give text explanation
        logToFile('⏭️ User skipped keyword video', { feature: detectedFeature, userId });

        const textExplanations = {
          reading: {
            en: "No problem! To assess reading fluency, type /reading test - I'll guide your student through reading a passage and analyze their fluency, accuracy, and comprehension.",
            ur: "کوئی بات نہیں! ریڈنگ فلوئنسی جانچنے کے لیے /reading test ٹائپ کریں - میں آپ کے طالب علم کو ایک متن پڑھنے میں رہنمائی کروں گی۔",
            ar: "لا مشكلة! لتقييم طلاقة القراءة، اكتب /reading test - سأرشد طالبك خلال قراءة نص وأحلل طلاقته ودقته وفهمه.",
            es: "¡No hay problema! Para evaluar la fluidez lectora, escribe /reading test - guiaré a tu estudiante a través de la lectura de un pasaje."
          },
          coaching: {
            en: "No problem! Just send me an audio recording of your class (up to 20 minutes), and I'll analyze your teaching and provide personalized feedback.",
            ur: "کوئی بات نہیں! مجھے اپنی کلاس کی آڈیو ریکارڈنگ بھیجیں (20 منٹ تک)، میں آپ کی تدریس کا تجزیہ کر کے فیڈبیک دوں گی۔",
            ar: "لا مشكلة! أرسل لي تسجيلاً صوتياً لفصلك (حتى 20 دقيقة)، وسأحلل تدريسك وأقدم ملاحظات مخصصة.",
            es: "¡No hay problema! Envíame una grabación de audio de tu clase (hasta 20 minutos), analizaré tu enseñanza y te daré retroalimentación personalizada."
          },
          lesson_plan: {
            en: "No problem! Just tell me what you want to teach (subject, topic, grade level), and I'll create a detailed 5-step lesson plan with activities.",
            ur: "کوئی بات نہیں! مجھے بتائیں آپ کیا پڑھانا چاہتے ہیں (مضمون، عنوان، گریڈ)، میں 5 مراحل کا تفصیلی لیسن پلان بناؤں گی۔",
            ar: "لا مشكلة! أخبرني فقط ماذا تريد أن تدرس (المادة، الموضوع، مستوى الصف)، وسأنشئ خطة درس مفصلة من 5 خطوات.",
            es: "¡No hay problema! Solo dime qué quieres enseñar (materia, tema, nivel), y crearé un plan de lección detallado de 5 pasos."
          }
        };

        const explanation = textExplanations[detectedFeature]?.[language]
          || textExplanations[detectedFeature]?.en;

        if (explanation) {
          await WhatsAppService.sendMessage(phoneNumber, explanation);
        }

        // Log decline
        await this._logKeywordConsent(userId, detectedFeature, false);
      }

      return true;
    } catch (error) {
      logToFile('❌ Error handling keyword consent button', { error: error.message, buttonId });
      return false;
    }
  }

  /**
   * Log keyword consent response
   * @private
   */
  static async _logKeywordConsent(userId, feature, acceptedVideo) {
    try {
      const supabase = require('../config/supabase');
      await supabase.from('feature_suggestions').insert({
        user_id: userId,
        suggested_feature: feature,
        trigger_type: 'keyword',
        was_shown: true,
        was_clicked: acceptedVideo,
        message_context: acceptedVideo ? 'Keyword detection - user accepted video' : 'Keyword detection - user skipped video'
      });
    } catch (error) {
      logToFile('Error logging keyword consent', { error: error.message });
    }
  }
}

module.exports = FeatureKeywordDetectorService;
