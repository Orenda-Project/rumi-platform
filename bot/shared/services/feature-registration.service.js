/**
 * Feature-Based Registration Service
 * Ultra-simple 1-question registration triggered after first feature completion
 *
 * Flow:
 * 1. User completes any feature (lesson plan, coaching, reading, video)
 * 2. If unregistered, send "What should I call you?" message (SEPARATE from feature delivery)
 * 3. User responds with name
 * 4. Store name, generate portal token, send confirmation WITH portal link
 *
 * Replaces the old flow-based registration with WhatsApp Flow template.
 * This is ultra-simple: just ask for name, nothing else.
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const AudioService = require('./audio.service');
const { TEMP_DIR } = require('../utils/constants');

class FeatureRegistrationService {
  /**
   * Check if user needs registration and trigger the name question if so
   * Called AFTER feature delivery is complete (separate message)
   *
   * @param {string} userId - User's UUID
   * @param {string} featureType - 'lesson_plan' | 'coaching' | 'reading' | 'video'
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @param {string} format - 'text' | 'voice' - mirrors how user interacted
   * @returns {Promise<boolean>} - true if registration was triggered
   */
  static async checkAndTriggerRegistration(userId, featureType, phoneNumber, language = 'en', format = 'text') {
    try {
      logToFile('Checking registration eligibility', { userId, featureType, language });

      // Get user to check registration status
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('first_name, registration_completed, registration_pending_name')
        .eq('id', userId)
        .single();

      if (userError) {
        logToFile('Error fetching user for registration check', { userId, error: userError.message });
        return false;
      }

      // Skip if already registered
      if (user.first_name || user.registration_completed) {
        logToFile('User already registered, skipping', { userId, firstName: user.first_name });
        return false;
      }

      // Skip if already waiting for name
      if (user.registration_pending_name) {
        logToFile('Already waiting for name response, skipping', { userId });
        return false;
      }

      // Check if this is first feature completion
      const featureCount = await this.countUserFeatures(userId);

      if (featureCount !== 1) {
        logToFile('Not first feature, skipping registration', { userId, featureCount });
        return false;
      }

      // Trigger registration - ask for name
      await this.sendNameQuestion(userId, phoneNumber, language, format);

      logToFile('Registration triggered after first feature', { userId, featureType });
      return true;

    } catch (error) {
      logToFile('Error in checkAndTriggerRegistration', {
        userId,
        featureType,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Count completed features for a user
   * Used to determine if this is the first feature
   *
   * @param {string} userId - User's UUID
   * @returns {Promise<number>} - Total feature count
   */
  static async countUserFeatures(userId) {
    try {
      // Count lesson plans
      const { count: lessonPlans } = await supabase
        .from('lesson_plans')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Count coaching sessions
      const { count: coachingSessions } = await supabase
        .from('coaching_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Count reading assessments
      const { count: readingAssessments } = await supabase
        .from('reading_assessments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Count video requests (completed)
      const { count: videos } = await supabase
        .from('video_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed');

      const total = (lessonPlans || 0) + (coachingSessions || 0) + (readingAssessments || 0) + (videos || 0);

      logToFile('Feature count for user', {
        userId,
        lessonPlans,
        coachingSessions,
        readingAssessments,
        videos,
        total
      });

      return total;
    } catch (error) {
      logToFile('Error counting user features', { userId, error: error.message });
      return 0;
    }
  }

  /**
   * Send the name question to user
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @param {string} format - 'text' | 'voice'
   */
  static async sendNameQuestion(userId, phoneNumber, language = 'en', format = 'text') {
    // Presence-gated: if a registration Flow is configured, open the polished
    // form instead of the conversational name question. Unset (default) → the
    // conversational path below. The Flow completes via
    // FlowResponseHandler.handleRegistrationFlow (it does not set
    // registration_pending_name, which is the text-name path's flag).
    const REGISTRATION_FLOW_ID = process.env.REGISTRATION_FLOW_ID || '';
    if (REGISTRATION_FLOW_ID) {
      try {
        await WhatsAppService.sendFlow(phoneNumber, {
          flowId: REGISTRATION_FLOW_ID,
          flowToken: userId,
          header: 'Welcome',
          body: 'Quick setup — tell us a little about you.',
          footer: 'Powered by Rumi',
          buttonText: 'Get started',
        });
        logToFile('Registration flow sent (presence-gated)', { userId, phoneNumber });
        return;
      } catch (error) {
        logToFile('Registration flow send failed; falling back to name question', { userId, error: error.message });
        // fall through to the conversational path
      }
    }

    const messages = {
      en: "By the way, what should I call you?",
      ur: "ویسے، میں آپ کو کیا نام سے بلاؤں؟",
      ar: "بالمناسبة، ماذا أناديك؟",
      es: "Por cierto, ¿cómo te llamo?",
      'bal-PK': "آں راھ، مَنا کہ نامئی گوَشت؟",
      'sd-PK': "واسي، آئون توهان کي ڇا سڏيان؟",
      'ps-PK': "په لاره، زه تاسو ته څه ووایم؟",
      'pa-PK': "ویسے، میں تہاڈا ناں کی رکھاں؟",
      'ta-LK': "சொல்லுங்க, உங்களை என்னன்னு கூப்பிடட்டுமா?"
    };

    const message = messages[language] || messages.en;

    try {
      if (format === 'voice') {
        // Generate and send voice message
        const speechBuffer = await AudioService.generateSpeechForLanguage(message, language);
        await WhatsAppService.sendAudio(phoneNumber, speechBuffer, TEMP_DIR);
      } else {
        // Send text message
        await WhatsAppService.sendMessage(phoneNumber, message);
      }

      // Mark user as waiting for name
      await supabase
        .from('users')
        .update({ registration_pending_name: true })
        .eq('id', userId);

      logToFile('Name question sent', { userId, phoneNumber, language, format });
    } catch (error) {
      logToFile('Error sending name question', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Handle user's name response
   * Extracts name, stores it, generates portal token, sends confirmation with link
   *
   * @param {string} userId - User's UUID
   * @param {string} nameResponse - User's text/voice response containing name
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @param {string} format - 'text' | 'voice' - to mirror response format
   * @returns {Promise<{success: boolean, firstName?: string, error?: string}>}
   */
  static async handleNameResponse(userId, nameResponse, phoneNumber, language = 'en', format = 'text') {
    try {
      logToFile('Handling name response', { userId, nameResponse, language });

      // Extract first name (simple extraction - take first word or whole response)
      const firstName = this.extractFirstName(nameResponse);

      if (!firstName) {
        logToFile('Could not extract name from response', { userId, nameResponse });
        return { success: false, error: 'Could not extract name' };
      }

      // Generate portal token
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // Update user with name, portal token, and clear pending flag
      const { error: updateError } = await supabase
        .from('users')
        .update({
          first_name: firstName,
          name: firstName, // Also update legacy name field
          registration_completed: true,
          registration_completed_at: new Date().toISOString(),
          registration_pending_name: false,
          portal_invite_token: token,
          portal_invite_expires_at: expiresAt.toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        logToFile('Error updating user with name', { userId, error: updateError.message });
        throw updateError;
      }

      // Send confirmation. portalUrl is null if PORTAL_URL is unset, in
      // which case sendConfirmation omits the link from the message.
      const portalBase = require('../config/branding').portalUrl();
      const portalUrl = portalBase ? `${portalBase}/portal/setup/${token}` : null;
      await this.sendConfirmation(firstName, portalUrl, phoneNumber, language, format);

      logToFile('Registration completed successfully', {
        userId,
        firstName,
        portalUrl: portalUrl ? portalUrl.substring(0, 50) + '...' : '(PORTAL_URL not configured)'
      });

      return { success: true, firstName };

    } catch (error) {
      logToFile('Error handling name response', {
        userId,
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract first name from user response
   * Handles various response patterns
   *
   * @param {string} response - User's response
   * @returns {string|null} - Extracted first name or null
   */
  static extractFirstName(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    // Clean up the response
    let name = response.trim();

    // Common patterns to strip
    const prefixes = [
      // English
      /^(my name is|i am|i'm|call me|it's|this is|hey i'm|hi i'm)\s+/i,
      // Urdu - common patterns (romanized and native)
      /^(mera naam|میرا نام|mujhe|مجھے|naam|نام)\s+/i,
      // Arabic
      /^(اسمي|انا|أنا)\s+/i,
      // Spanish
      /^(me llamo|soy|mi nombre es)\s+/i
    ];

    for (const prefix of prefixes) {
      name = name.replace(prefix, '');
    }

    // Remove trailing punctuation and common suffixes
    name = name.replace(/[.!,?]+$/, '').trim();
    name = name.replace(/\s+(hai|ہے|is|he|hey|hoon|ہوں)$/i, '').trim();

    // If there are multiple words, take just the first one (first name)
    const words = name.split(/\s+/);
    if (words.length > 0 && words[0].length > 0) {
      // Capitalize first letter
      const firstName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      return firstName;
    }

    return null;
  }

  /**
   * Send confirmation message with portal link
   *
   * @param {string} firstName - User's first name
   * @param {string} portalUrl - Portal setup URL
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's preferred language
   * @param {string} format - 'text' | 'voice'
   */
  static async sendConfirmation(firstName, portalUrl, phoneNumber, language = 'en', format = 'text') {
    // When PORTAL_URL isn't configured, portalUrl is null. Fall back to a
    // portal-free welcome so cloners don't ship a broken placeholder link.
    if (!portalUrl) {
      const noPortal = {
        en: `Nice to meet you, ${firstName}! What would you like to work on next?`,
        ur: `آپ سے مل کر خوشی ہوئی، ${firstName}! آگے آپ کس پر کام کرنا چاہیں گے؟`,
        ar: `سعيد بلقائك، ${firstName}! ماذا تريد أن تعمل عليه بعد ذلك؟`,
        es: `¡Mucho gusto, ${firstName}! ¿En qué te gustaría trabajar a continuación?`,
        'bal-PK': `توارا گُڈ چاتین، ${firstName}!`,
        'sd-PK': `توهان سان ملي خوشي ٿي، ${firstName}!`,
        'ps-PK': `ستاسو سره په لیدو خوشحاله شوم، ${firstName}!`,
        'pa-PK': `تہانوں مل کے خوشی ہوئی، ${firstName}!`,
        'ta-LK': `சந்திப்பதில் மகிழ்ச்சி, ${firstName}!`,
      };
      const message = noPortal[language] || noPortal.en;
      await WhatsAppService.sendMessage(phoneNumber, message);
      logToFile('Confirmation sent (no portal)', { phoneNumber, firstName });
      return;
    }
    const messages = {
      en: `Nice to meet you, ${firstName}! I've also set up your personal Rumi portal where you can track your growth and access all your lesson plans, coaching reports, and more.

🔗 *Set up your portal:*
${portalUrl}

This link expires in 7 days. What would you like to work on next?`,

      ur: `آپ سے مل کر خوشی ہوئی، ${firstName}! میں نے آپ کا ذاتی Rumi پورٹل بھی بنا دیا ہے جہاں آپ اپنی ترقی دیکھ سکتے ہیں اور اپنے تمام لیسن پلانز، کوچنگ رپورٹس وغیرہ تک رسائی حاصل کر سکتے ہیں۔

🔗 *اپنا پورٹل سیٹ اپ کریں:*
${portalUrl}

یہ لنک 7 دنوں میں ختم ہو جائے گی۔ آگے آپ کس پر کام کرنا چاہیں گے؟`,

      ar: `سعيد بلقائك، ${firstName}! لقد أنشأت أيضًا بوابة Rumi الشخصية الخاصة بك حيث يمكنك تتبع نموك والوصول إلى جميع خطط دروسك وتقارير التدريب والمزيد.

🔗 *قم بإعداد بوابتك:*
${portalUrl}

تنتهي صلاحية هذا الرابط خلال 7 أيام. ماذا تريد أن تعمل عليه بعد ذلك؟`,

      es: `¡Mucho gusto, ${firstName}! También he configurado tu portal personal de Rumi donde puedes seguir tu progreso y acceder a todos tus planes de lección, informes de coaching y más.

🔗 *Configura tu portal:*
${portalUrl}

Este enlace expira en 7 días. ¿En qué te gustaría trabajar a continuación?`,

      'bal-PK': `توارا گُڈ چاتین، ${firstName}! منا توارا Rumi پورٹل ہم جوڑ کتگ، جتا تو وتی ترقی چاراں بکنئے۔

🔗 *پورٹل سیٹ کن:*
${portalUrl}

اے لِنک 7 روچان پُر ختم بیت۔`,

      'sd-PK': `توهان سان ملي خوشي ٿي، ${firstName}! مون توهان جو Rumi پورٹل به ٺاهي ڇڏيو آهي جتي توهان پنهنجي ترقي ڏسي سگهو ٿا۔

🔗 *پنهنجو پورٹل سيٽ اپ ڪريو:*
${portalUrl}

هي لنڪ 7 ڏينهن ۾ ختم ٿي ويندي۔`,

      'ps-PK': `ستاسو سره په لیدو خوشحاله شوم، ${firstName}! ما ستاسو شخصي Rumi پورټل هم جوړ کړی چیرته چې تاسو خپله پرمختګ وګورئ۔

🔗 *خپل پورټل تنظیم کړئ:*
${portalUrl}

دا لینک په 7 ورځو کې ختمیږي۔`,

      'pa-PK': `تہانوں مل کے خوشی ہوئی، ${firstName}! میں تہاڈا ذاتی Rumi پورٹل وی بنا دتا اے جتھے تسی اپنی ترقی ویکھ سکدے او۔

🔗 *اپنا پورٹل سیٹ اپ کرو:*
${portalUrl}

ایہ لنک 7 دناں چ ختم ہو جاوے گی۔`,

      'ta-LK': `சந்திப்பதில் மகிழ்ச்சி, ${firstName}! உங்கள் தனிப்பட்ட Rumi போர்டலையும் அமைத்துள்ளேன்.

🔗 *உங்கள் போர்டலை அமைக்கவும்:*
${portalUrl}

இந்த இணைப்பு 7 நாட்களில் காலாவதியாகும்.`
    };

    const message = messages[language] || messages.en;

    try {
      if (format === 'voice') {
        // For voice, send text message with link (voice can't include clickable links)
        await WhatsAppService.sendMessage(phoneNumber, message);
      } else {
        await WhatsAppService.sendMessage(phoneNumber, message);
      }

      logToFile('Confirmation sent with portal link', { phoneNumber, firstName });
    } catch (error) {
      logToFile('Error sending confirmation', { phoneNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Check if user is waiting for name response
   *
   * @param {string} userId - User's UUID
   * @returns {Promise<boolean>}
   */
  static async isPendingName(userId) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('registration_pending_name')
        .eq('id', userId)
        .single();

      if (error) {
        logToFile('Error checking pending name status', { userId, error: error.message });
        return false;
      }

      return user?.registration_pending_name === true;
    } catch (error) {
      logToFile('Error in isPendingName', { userId, error: error.message });
      return false;
    }
  }
}

module.exports = FeatureRegistrationService;
