/**
 * Feature Introduction Service
 * Handles first-use tracking and video introduction for onboarding
 *
 * Integration Points:
 * 1. First slash command use (implicit consent) - sends video before feature
 * 2. After feature completion (explicit consent) - asks via button before video
 * 3. Keyword detection (explicit consent) - asks via button before video
 */

const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const WhatsAppService = require('./whatsapp.service');
const { FEATURE_VIDEO_URLS, FIRST_USE_INTRO_MESSAGES } = require('../constants/feature-videos');

/**
 * Map regional languages to their fallback language
 */
const LANGUAGE_FALLBACK_MAP = {
  'pa-PK': 'ur',
  'sd-PK': 'ur',
  'ps-PK': 'ur',
  'bal-PK': 'ur',
  'ta-LK': 'en',
};

class FeatureIntroService {
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
   * Check if user has seen the intro video for a feature
   * @param {string} userId - User's UUID
   * @param {string} feature - Feature name ('reading', 'coaching', 'lesson_plan')
   * @returns {Promise<boolean>} True if user has seen the video
   */
  static async hasSeenIntroVideo(userId, feature) {
    try {
      const { data, error } = await supabase
        .from('user_feature_first_use')
        .select('id')
        .eq('user_id', userId)
        .eq('feature', feature)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, which is expected for first-time users
        logToFile('Error checking intro video status', { error: error.message, userId, feature });
      }

      return !!data;
    } catch (error) {
      logToFile('Error in hasSeenIntroVideo', { error: error.message, userId, feature });
      return false; // Default to not seen on error
    }
  }

  /**
   * Mark that user has seen the intro video for a feature
   * @param {string} userId - User's UUID
   * @param {string} feature - Feature name
   */
  static async markVideoShown(userId, feature) {
    try {
      const { error } = await supabase
        .from('user_feature_first_use')
        .upsert({
          user_id: userId,
          feature: feature,
          video_shown_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,feature'
        });

      if (error) {
        logToFile('Error marking video shown', { error: error.message, userId, feature });
      } else {
        logToFile('📹 Marked intro video as shown', { userId, feature });
      }
    } catch (error) {
      logToFile('Error in markVideoShown', { error: error.message, userId, feature });
    }
  }

  /**
   * Mark that user has used a feature (after video was shown)
   * @param {string} userId - User's UUID
   * @param {string} feature - Feature name
   */
  static async markFeatureUsed(userId, feature) {
    try {
      const { error } = await supabase
        .from('user_feature_first_use')
        .update({ feature_used_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('feature', feature);

      if (error) {
        logToFile('Error marking feature used', { error: error.message, userId, feature });
      }
    } catch (error) {
      logToFile('Error in markFeatureUsed', { error: error.message, userId, feature });
    }
  }

  /**
   * Send feature introduction video if this is user's first time
   * Used for Integration Point 2: First-time slash command (implicit consent)
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} feature - Feature name ('reading', 'coaching', 'lesson_plan')
   * @param {string} language - User's preferred language
   * @returns {Promise<boolean>} True if video was sent (first time), false if skipped (returning user)
   */
  static async sendFirstUseIntroIfNeeded(userId, phoneNumber, feature, language = 'en') {
    try {
      // Check if user has already seen the video
      const hasSeen = await this.hasSeenIntroVideo(userId, feature);

      if (hasSeen) {
        logToFile('📹 Skipping intro video - user already seen', { userId, feature });
        return false;
      }

      // Get video URL
      const videoUrl = FEATURE_VIDEO_URLS[feature];
      if (!videoUrl) {
        logToFile('❌ No video URL found for feature', { feature });
        return false;
      }

      // Get intro message in user's language
      const msgLanguage = this._getMessageLanguage(language);
      const introMessage = FIRST_USE_INTRO_MESSAGES[feature]?.[msgLanguage]
        || FIRST_USE_INTRO_MESSAGES[feature]?.en
        || "Here's a quick look at how this feature works! 🎥";

      logToFile('📹 Sending first-use intro video', { userId, feature, language: msgLanguage });

      // Send intro message
      await WhatsAppService.sendMessage(phoneNumber, introMessage);

      // Small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Send video
      await WhatsAppService.sendVideoFromUrl(phoneNumber, videoUrl);

      // Mark as shown
      await this.markVideoShown(userId, feature);

      // Small delay before continuing with feature
      await new Promise(resolve => setTimeout(resolve, 2000));

      return true;
    } catch (error) {
      logToFile('❌ Error in sendFirstUseIntroIfNeeded', {
        error: error.message,
        userId,
        feature,
        stack: error.stack
      });
      return false; // Don't block feature usage on error
    }
  }
}

module.exports = FeatureIntroService;
