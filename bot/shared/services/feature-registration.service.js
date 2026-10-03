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

const crypto = require('crypto');
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const AudioService = require('./audio.service');
const { TEMP_DIR } = require('../utils/constants');
const { nativeFlowIdFor } = require('./messaging/channel-capabilities');
const { ownCoaching } = require('./coaching/own-coaching');

// Greetings and acknowledgements that are not names (English, and the
// romanized forms teachers commonly type in the supported languages).
const GREETINGS = 'hi|hello|hey|hiya|salam|salaam|assalam(?:u|o)?\\s*(?:o\\s*)?alaikum|aoa|good\\s+(?:morning|afternoon|evening)|hola|marhaba';
const ACKS = 'ok|okay|yes|no|thanks|thank\\s+you|sure|fine';
const GREETING_ONLY_RE = new RegExp(`^(?:${GREETINGS})$`, 'i');
const ACK_RE = new RegExp(`^(?:${ACKS})$`, 'i');
// A greeting in front of something else. The separator must hold a space or
// a comma, so a hyphenated name that starts like a greeting ("Hi-Young") is
// left whole.
const GREETING_LEAD_RE = new RegExp(`^(${GREETINGS})([\\s,.!]*[\\s,][\\s,.!]*)(\\S.*)$`, 'i');
// Greetings that are also given names. After one of these, a bare name with
// no punctuation in between ("Salam Karimi") is read as the teacher's full
// name, not as a greeting to them.
const NAME_LIKE_GREETING_RE = /^(?:salam|salaam)$/i;
// What a teacher writes before their name when they introduce themselves.
const INTRODUCTION_RE = /^(?:my name is|i am|i'm|im|this is|it's|its|call me|mera naam|me llamo|soy|mi nombre es|اسمي|انا|أنا)\s/i;
// A literal placeholder (a client that fills an empty field, or a teacher
// testing) is never a name; "Teacher: Null" is the bug this guards.
const PLACEHOLDER_RE = /^(?:null|undefined|none)$/i;
// "Yes" to "Is "Salam" your name?" is as clear as sending Salam again.
const AFFIRMATIVE_RE = /^(?:yes|yeah|yep|ok|okay|haan|han|ji|jee|si|sí|نعم|ہاں|جی)$/i;
// An introduction in front of the name, for reading what follows it (the
// greeting before it, if any, already stripped). Wider than INTRODUCTION_RE:
// it also takes the forms that parseNameReply strips with no greeting first.
const INTRODUCTION_PREFIX_RE = /^(?:my name is|i am|i'm|i’m|im|this is|it's|its|call me|mera naam|میرا نام|naam|نام|me llamo|soy|mi nombre es|اسمي|انا|أنا)\s+/i;
// The introductions that say plainly a name follows, so the name is taken
// with no confirm while the Matrix offer is open. Not "it's": "it's raining"
// is chat, and "it's Sadia" still gets the confirm.
const EXPLICIT_INTRODUCTION_RE = /^(?:my name is|i am|i'm|i’m|im|this is|call me|mera naam|میرا نام|naam|نام|me llamo|soy|mi nombre es|اسمي|انا|أنا)\s+/i;
// Words a name reply does not start with: the first word of a question or a
// request, a pronoun or article, a feature, a word people send after a
// greeting ("Hello Rumi", "Hi there"), or a thanks or acknowledgement sent
// while the Matrix offer is open ("got it", "Shukriya"). Lower case.
const NOT_A_NAME_WORDS = new Set([
  'what', "what's", 'whats', 'how', 'why', 'when', 'where', 'who', 'whom', 'which',
  'can', 'could', 'would', 'will', 'should', 'shall', 'is', 'are', 'am', 'was', 'do', 'does', 'did', 'have', 'has',
  'please', 'pls', 'plz', 'help', 'make', 'give', 'tell', 'show', 'create', 'write', 'explain', 'generate',
  'send', 'start', 'teach', 'prepare', 'need', 'want', 'let', "let's", 'lets',
  'i', 'me', 'my', 'we', 'you', 'your', 'it', 'this', 'that', 'the', 'a', 'an', 'not', 'just', 'so', 'very',
  'quiz', 'lesson', 'lessons', 'plan', 'video', 'reading', 'coaching', 'menu', 'register', 'registration',
  'attendance', 'homework', 'grade', 'class', 'test', 'exam', 'worksheet',
  'rumi', 'there', 'everyone', 'all', 'sir', 'madam', 'miss', 'teacher',
  'yes', 'no', 'good', 'great', 'nice', 'cool', 'fine',
  'got', 'thank', 'thanks', 'thx', 'shukriya', 'shukria', 'gracias', 'shukran',
]);
// Letters (any script) and the marks that join a name: Mary-Jane, O'Neil.
const NAME_WORD_RE = /^[\p{L}\p{M}'’.-]+$/u;
// "Not now" to an offered name question. Romanized and native forms of the
// supported languages. Matched against the whole reply, so a sentence that
// starts with "no" ("no idea how to teach fractions") is not a decline.
const DECLINE_RE = /^(?:no|nope|nah|no thanks|no thank you|no thx|not now|not yet|not today|later|maybe later|skip|skip it|nahi|nahin|nahi shukriya|baad mein|baad main|phir kabhi|نہیں|بعد میں|ابھی نہیں|لا|لا شكرا|لاحقا|ahora no|más tarde|mas tarde)$/i;

// The name question, worded for why it is asked. 'requested' and 'offer' are used on
// Matrix, where a person can register before using a feature; 'offer' comes
// unasked, so it says plainly that it can be ignored, and names the bare word
// register (a slash command is not how people type on that channel).
const NAME_QUESTIONS = {
  after_feature: {
    en: "By the way, what should I call you?",
    ur: "ویسے، میں آپ کو کیا نام سے بلاؤں؟",
    ar: "بالمناسبة، ماذا أناديك؟",
    es: "Por cierto, ¿cómo te llamo?",
    'bal-PK': "آں راھ، مَنا کہ نامئی گوَشت؟",
    'sd-PK': "واسي، آئون توهان کي ڇا سڏيان؟",
    'ps-PK': "په لاره، زه تاسو ته څه ووایم؟",
    'pa-PK': "ویسے، میں تہاڈا ناں کی رکھاں؟",
    'ta-LK': "சொல்லுங்க, உங்களை என்னன்னு கூப்பிடட்டுமா?"
  },
  requested: {
    en: "Let's get you registered. What should I call you?",
    ur: "آئیں آپ کو رجسٹر کرتے ہیں۔ میں آپ کو کس نام سے بلاؤں؟",
    ar: "لنسجّلك الآن. ماذا أناديك؟",
    es: "Vamos a registrarte. ¿Cómo te llamo?"
  },
  offer: {
    en: "By the way, what should I call you? Tell me your name to register — or just keep chatting; you can type register any time.",
    ur: "ویسے، میں آپ کو کس نام سے بلاؤں؟ رجسٹر ہونے کے لیے اپنا نام بتا دیں — یا بس بات جاری رکھیں؛ آپ کسی بھی وقت register لکھ سکتے ہیں۔",
    ar: "بالمناسبة، ماذا أناديك؟ أخبرني باسمك للتسجيل — أو تابع الحديث فقط؛ يمكنك كتابة register في أي وقت.",
    es: "Por cierto, ¿cómo te llamo? Dime tu nombre para registrarte — o simplemente sigue conversando; puedes escribir register cuando quieras."
  }
};

// The reply to "no thanks" when the offer is closed.
const DECLINE_MESSAGES = {
  en: "No problem — type register whenever you'd like to.",
  ur: "کوئی بات نہیں — جب چاہیں register لکھ دیں۔",
  ar: "لا مشكلة — اكتب register متى شئت.",
  es: "No hay problema — escribe register cuando quieras."
};

// The word Rumi asked about ("Is "Salam" your name?", or on Matrix "Shall I
// call you Sadia?"), kept until the teacher answers.
// Redis when available (so a deploy between the two messages does not lose
// it), memory otherwise; losing it only means asking once more.
const NAME_CANDIDATE_KEY = (userId) => `registration:name_candidate:${userId}`;
const NAME_CANDIDATE_TTL_SECONDS = 24 * 3600;
const nameCandidates = new Map();
// The unasked offer is made once. registration_pending_name alone cannot say
// so: "no thanks" clears it, and the next reply would offer again. Redis when
// available, memory when Redis is down; losing it only means one more offer.
const OFFERED_KEY = (userId) => `registration:offered:${userId}`;
const OFFERED_TTL_SECONDS = 90 * 24 * 3600;
const offeredInMemory = new Set();

/**
 * Redis is required lazily: railway-redis.service.js connects on require, and
 * this service is loaded by tools that never touch a pending name.
 */
function redis() {
  // eslint-disable-next-line global-require -- deliberate: see comment above
  return require('./cache/railway-redis.service');
}

/** Strips trailing punctuation, for comparing a reply to a word list. */
function bare(text) {
  return text.replace(/[.!,?]+$/, '').trim();
}

/** "salam" -> "Salam", "hi-young" -> "Hi-Young". */
function capitalizeName(word) {
  return word.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('-');
}

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
      const { count: coachingSessions } = await ownCoaching(supabase
        .from('coaching_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)); // never a coach's observation of this teacher: it is not their own session

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
   * @param {Object} [options]
   * @param {string} [options.variant] - how the question is worded on the
   *   conversational path: 'after_feature' (default, the question that follows
   *   a finished feature), 'requested' (the teacher asked to register) or
   *   'offer' (offered unasked on a first conversation; says it is optional)
   */
  static async sendNameQuestion(userId, phoneNumber, language = 'en', format = 'text', { variant = 'after_feature' } = {}) {
    // Slack/Discord have a real Flow-equivalent (a modal-workaround renderer,
    // opened by button click — see slack-flow-registry.js /
    // discord-flow-registry.js), not sendFlow()'s Meta/Baileys-shaped
    // {flowId, flowToken} contract, which is a no-op stub on both. Previously
    // this branch didn't exist at all, so Slack/Discord users silently fell
    // through to the plain-text name-capture path below instead of getting
    // the polished registration form — fixed here for both channels, matching
    // how /settings already branches on driverForIdentifier() in
    // text-message.handler.js.
    const { driverForIdentifier } = require('./messaging/channel-registry');
    const driverName = driverForIdentifier(phoneNumber);

    if (driverName === 'slack') {
      try {
        await WhatsAppService.sendInteractiveButtons(phoneNumber, {
          body: 'Quick setup — tell us a little about you.',
          buttons: [{ id: 'open_modal:registration', title: 'Get started' }],
        });
        logToFile('Registration modal button sent (Slack)', { userId, phoneNumber });
        return;
      } catch (error) {
        logToFile('Slack registration button send failed; falling back to name question', { userId, error: error.message });
        // fall through to the conversational path
      }
    }

    if (driverName === 'discord') {
      try {
        await WhatsAppService.sendInteractiveButtons(phoneNumber, {
          body: 'Quick setup — tell us a little about you.',
          buttons: [{ id: 'discord_start_flow:registration', title: 'Get started' }],
        });
        logToFile('Registration modal button sent (Discord)', { userId, phoneNumber });
        return;
      } catch (error) {
        logToFile('Discord registration button send failed; falling back to name question', { userId, error: error.message });
        // fall through to the conversational path
      }
    }

    // Presence-gated: if a registration Flow is configured, open the polished
    // form instead of the conversational name question. Unset (default) → the
    // conversational path below. The Flow completes via
    // FlowResponseHandler.handleRegistrationFlow (it does not set
    // registration_pending_name, which is the text-name path's flag). A
    // channel that can't draw the Flow (Matrix, Baileys) always asks in text.
    const REGISTRATION_FLOW_ID = nativeFlowIdFor(phoneNumber, process.env.REGISTRATION_FLOW_ID);
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

    const messages = NAME_QUESTIONS[variant] || NAME_QUESTIONS.after_feature;
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
   * Offer registration to someone who has just been answered and is not
   * registered: the name question, worded as optional. Used on Matrix, where
   * the room is one the person opened with Rumi, so asking on a first
   * conversation is not the cold message it would be on WhatsApp. Sets
   * registration_pending_name (through sendNameQuestion), so it is offered
   * once; the person can still type register later.
   *
   * Never throws: the reply it follows has already been sent, and a failed
   * offer must not turn that into an error.
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - The sender identifier to reply to
   * @param {string} language - User's preferred language
   * @returns {Promise<boolean>} true if the offer was sent
   */
  static async offerRegistration(userId, phoneNumber, language = 'en') {
    try {
      // Read fresh: the user object the handler holds was loaded before this
      // message, and may predate a name given or an offer made since.
      const { data: user, error } = await supabase
        .from('users')
        .select('first_name, registration_completed, registration_pending_name')
        .eq('id', userId)
        .single();
      if (error || !user) {
        logToFile('Registration offer skipped: user not readable', { userId, error: error && error.message });
        return false;
      }
      if (user.first_name || user.registration_completed === true || user.registration_pending_name) return false;
      if (await this._wasOffered(userId)) return false;

      await this.sendNameQuestion(userId, phoneNumber, language, 'text', { variant: 'offer' });
      await this._markOffered(userId);
      logToFile('Registration offered on first contact', { userId });
      return true;
    } catch (error) {
      logToFile('Registration offer failed (the reply was already sent)', { userId, error: error.message });
      return false;
    }
  }

  /**
   * Close an offered name question the person turned down ("no thanks"): stop
   * waiting for a name and say how to register later.
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - The sender identifier to reply to
   * @param {string} language - User's preferred language
   */
  static async declineRegistration(userId, phoneNumber, language = 'en') {
    await supabase
      .from('users')
      .update({ registration_pending_name: false })
      .eq('id', userId);
    await this._clearNameCandidate(userId);
    await WhatsAppService.sendMessage(phoneNumber, DECLINE_MESSAGES[language] || DECLINE_MESSAGES.en);
    logToFile('Registration offer declined', { userId });
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
   * @param {Object} [options]
   * @param {boolean} [options.confirmBareWord] - read the reply as on Matrix,
   *   where the question can be ignored (resolveOfferedNameReply): a bare word
   *   is asked about before it is stored, and a reply that is not a name
   *   comes back as { chat: true } for the caller to handle as a message
   * @returns {Promise<{success: boolean, firstName?: string, confirm?: string, chat?: boolean, error?: string}>}
   */
  static async handleNameResponse(userId, nameResponse, phoneNumber, language = 'en', format = 'text', { confirmBareWord = false } = {}) {
    try {
      logToFile('Handling name response', { userId, nameResponse, language });

      // Extract first name (simple extraction - take first word or whole response)
      const { name: firstName, confirm, chat } = confirmBareWord
        ? await this.resolveOfferedNameReply(userId, nameResponse)
        : await this.resolveNameReply(userId, nameResponse);

      if (chat) {
        logToFile('Name pending, but this reply is not a name; handling it as a message', { userId });
        return { success: false, chat: true };
      }
      if (confirm) {
        logToFile('Name reply needs confirming; asking', { userId, candidate: confirm });
        return { success: false, confirm, error: 'Name needs confirming' };
      }
      if (!firstName) {
        logToFile('Could not extract name from response', { userId, nameResponse });
        return { success: false, error: 'Could not extract name' };
      }

      // Generate portal token, unless the user has no phone number to sign
      // in with (a Matrix username that is a name): a password set from that
      // link could never be used, so they get the portal-free welcome.
      const PortalInviteService = require('./portal-invite.service');
      const { data: user } = await supabase.from('users').select('id, phone_number').eq('id', userId).single();
      const canSignIn = Boolean(user && await PortalInviteService.signInNumberFor(user));
      const token = canSignIn ? crypto.randomUUID() : null;
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
          ...(token ? {
            portal_invite_token: token,
            portal_invite_expires_at: expiresAt.toISOString()
          } : {})
        })
        .eq('id', userId);

      if (updateError) {
        logToFile('Error updating user with name', { userId, error: updateError.message });
        throw updateError;
      }

      // Send confirmation. portalUrl is null if PORTAL_URL is unset, in
      // which case sendConfirmation omits the link from the message.
      const portalBase = require('../config/branding').portalUrl();
      const portalUrl = portalBase && token ? `${portalBase}/portal/setup/${token}` : null;
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
    return this.parseNameReply(response).name || null;
  }

  /**
   * Read a reply to "what should I call you?".
   *
   * Rumi asks for the name after a feature, and the next message is read as
   * the answer, so a teacher's "Hi" used to become their name (reports then
   * said "Teacher: Hi null"). But Salam is a name as well as a greeting, and a
   * filter that dropped every greeting word left a teacher named Salam unable
   * to register. So:
   * - a reply that is only one greeting word ("Salam", "Hi") is a candidate:
   *   the caller asks whether it is the name and takes it the second time;
   * - a leading greeting is stripped only when a space or comma follows it and
   *   then an introduction ("Hi, I'm Sara"), punctuation and a name ("Salam,
   *   Ali"), or anything after a greeting that is never a name ("Hello
   *   Ayesha"). "Salam Karimi" stays Salam. "Hi Young Park" gives Young: the
   *   reply cannot tell a greeting from a spaced given name, and a teacher
   *   named Hi-Young usually writes the hyphen, which is kept;
   * - nothing after "my name is" is stripped ("My name is Salam");
   * - acknowledgements and placeholders ("ok", "null") give nothing.
   *
   * @param {string} response - User's response
   * @returns {{name?: string, candidate?: string}} name when certain,
   *   candidate when the reply is a lone greeting word, {} otherwise
   */
  static parseNameReply(response) {
    if (!response || typeof response !== 'string') return {};

    let name = response.trim();
    if (!name || name.startsWith('/')) return {};

    const whole = bare(name);
    if (GREETING_ONLY_RE.test(whole)) {
      return /^\S+$/.test(whole) ? { candidate: capitalizeName(whole) } : {};
    }
    if (ACK_RE.test(whole) || PLACEHOLDER_RE.test(whole)) return {};

    const lead = name.match(GREETING_LEAD_RE);
    if (lead) {
      const [, greeting, separator, rest] = lead;
      const introduces = INTRODUCTION_RE.test(rest);
      const punctuated = /[,.!]/.test(separator);
      if (introduces || punctuated || !NAME_LIKE_GREETING_RE.test(greeting)) name = rest;
    }

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
    // After an introduction a greeting word is the name ("My name is Salam"),
    // but "I'm fine" and "it's null" still are not.
    if (!name || ACK_RE.test(bare(name)) || PLACEHOLDER_RE.test(bare(name))) return {};

    // Remove trailing punctuation and common suffixes
    name = bare(name);
    name = name.replace(/\s+(hai|ہے|is|he|hey|hoon|ہوں)$/i, '').trim();

    // If there are multiple words, take just the first one (first name)
    const words = name.split(/\s+/);
    if (words.length > 0 && words[0].length > 0 && !PLACEHOLDER_RE.test(words[0])) {
      return { name: capitalizeName(words[0]) };
    }

    return {};
  }

  /**
   * Decide what a name reply means, given what Rumi asked last. A lone
   * greeting word becomes the name when it repeats the candidate Rumi asked
   * about (or the teacher says yes); the first time, it is stored and the
   * caller asks.
   *
   * @param {string} userId
   * @param {string} response
   * @returns {Promise<{name?: string, confirm?: string}>}
   */
  static async resolveNameReply(userId, response) {
    const parsed = this.parseNameReply(response);
    const asked = await this._readNameCandidate(userId);
    const reply = bare(String(response || '').trim());

    if (asked && ((parsed.candidate && parsed.candidate.toLowerCase() === asked.toLowerCase())
      || AFFIRMATIVE_RE.test(reply))) {
      await this._clearNameCandidate(userId);
      return { name: asked };
    }
    if (parsed.candidate) {
      await this._storeNameCandidate(userId, parsed.candidate);
      return { confirm: parsed.candidate };
    }
    // Any other reply answers the question on its own; the old candidate is
    // dropped so a later lone greeting is asked about afresh.
    if (asked) await this._clearNameCandidate(userId);
    return parsed.name ? { name: parsed.name } : {};
  }

  /**
   * Decide what a reply means while a name question that can be ignored is
   * open (Matrix). There, keeping chatting is often one word ("fractions",
   * "Shukriya"), which reads exactly like a name, so a bare word is a name
   * only once the teacher confirms it:
   * - an introduction ("my name is Sadia", "Hi, I'm Sadia") is the name;
   * - a bare reply that looks like a name ("Sadia", "Salam") is stored as the
   *   candidate and the caller asks about it, once;
   * - after that question, "yes" or the same word again takes the candidate,
   *   and anything else drops it and is chat (the offer stays open);
   * - anything else is chat.
   * A decline is the caller's to check first.
   *
   * @param {string} userId
   * @param {string} response
   * @returns {Promise<{name?: string, confirm?: string, chat?: boolean}>}
   */
  static async resolveOfferedNameReply(userId, response) {
    const asked = await this._readNameCandidate(userId);
    if (asked && this._confirmsCandidate(asked, response)) {
      await this._clearNameCandidate(userId);
      return { name: asked };
    }
    if (this.introducesName(response)) {
      if (asked) await this._clearNameCandidate(userId);
      return { name: this.parseNameReply(response).name };
    }
    if (!asked && this.looksLikeNameReply(response)) {
      const parsed = this.parseNameReply(response);
      const candidate = parsed.candidate || parsed.name;
      await this._storeNameCandidate(userId, candidate);
      return { confirm: candidate };
    }
    if (asked) await this._clearNameCandidate(userId);
    return { chat: true };
  }

  /** "yes", or the same word again, after "Shall I call you <asked>?". */
  static _confirmsCandidate(asked, response) {
    if (AFFIRMATIVE_RE.test(bare(String(response || '').trim()))) return true;
    if (!this.looksLikeNameReply(response)) return false;
    const parsed = this.parseNameReply(response);
    const word = parsed.candidate || parsed.name;
    return Boolean(word) && word.toLowerCase() === asked.toLowerCase();
  }

  /**
   * Does this reply say plainly that it gives a name ("my name is Sadia",
   * "Hi, I'm Sadia", "mera naam Sadia hai")? A bare word does not.
   *
   * @param {string} response - User's reply
   * @returns {boolean}
   */
  static introducesName(response) {
    if (!this.looksLikeNameReply(response)) return false;
    let text = response.trim();
    const lead = text.match(GREETING_LEAD_RE);
    if (lead) text = lead[3];
    return EXPLICIT_INTRODUCTION_RE.test(text);
  }

  /**
   * Could this reply be an answer to "what should I call you?" at all?
   *
   * While a name is pending, the next message is read as the name. That suits
   * a question the teacher just saw after a feature, but an offered one can be
   * ignored, and then "How do I teach fractions?" became a teacher named
   * "How". This says whether to read the reply as a name, before any of it is
   * stored. Yes for an introduction ("my name is Ayesha", "Hi, I'm Ayesha",
   * "mera naam Ayesha hai"), a lone greeting word (the confirm question then
   * decides, see resolveNameReply), and a short reply of one to three words
   * of letters with no question mark or digit whose first word is not a
   * question, request, pronoun or feature word. No for anything else.
   *
   * @param {string} response - User's reply
   * @returns {boolean}
   */
  static looksLikeNameReply(response) {
    if (!response || typeof response !== 'string') return false;
    let text = response.trim();
    if (!text || text.startsWith('/') || /[?\d]/.test(text)) return false;

    const parsed = this.parseNameReply(text);
    if (parsed.candidate) return true;
    if (!parsed.name) return false;

    // Judge what is left once the greeting and the introduction are off.
    const lead = text.match(GREETING_LEAD_RE);
    if (lead) text = lead[3];
    text = text.replace(INTRODUCTION_PREFIX_RE, '');
    const words = bare(text).replace(/\s+(hai|ہے|hoon|ہوں)$/i, '').split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) return false;
    if (NOT_A_NAME_WORDS.has(words[0].toLowerCase())) return false;
    return words.every((word) => NAME_WORD_RE.test(word));
  }

  /**
   * Is this reply turning down the name question ("no thanks", "later")?
   *
   * @param {string} response - User's reply
   * @returns {boolean}
   */
  static isDeclineReply(response) {
    if (!response || typeof response !== 'string') return false;
    const text = bare(response.trim().replace(/[,]/g, ' ').replace(/\s+/g, ' '));
    return DECLINE_RE.test(text);
  }

  /**
   * Is this reply a step of registration where the name question can be
   * ignored (Matrix)? The same reading as resolveOfferedNameReply, without
   * storing anything: before Rumi asks about a word, anything that looks
   * like a name (it gets the confirm, or is an introduction); after, "yes",
   * the same word again, or an introduction. Chat is not.
   *
   * @param {string} userId - User's UUID
   * @param {string} response - User's reply
   * @returns {Promise<boolean>}
   */
  static async readsAsNameReply(userId, response) {
    const asked = await this._readNameCandidate(userId);
    if (!asked) return this.looksLikeNameReply(response);
    return this._confirmsCandidate(asked, response) || this.introducesName(response);
  }

  static async _wasOffered(userId) {
    if (offeredInMemory.has(userId)) return true;
    try {
      return Boolean(await redis().get(OFFERED_KEY(userId)));
    } catch (_) {
      return false;
    }
  }

  static async _markOffered(userId) {
    let stored = false;
    try {
      stored = await redis().set(OFFERED_KEY(userId), { at: new Date().toISOString() }, OFFERED_TTL_SECONDS);
    } catch (_) { /* memory below */ }
    // The cache answers false rather than throwing when Redis is down.
    if (!stored) offeredInMemory.add(userId);
  }

  static async _readNameCandidate(userId) {
    try {
      const stored = await redis().get(NAME_CANDIDATE_KEY(userId));
      if (stored && typeof stored.candidate === 'string') return stored.candidate;
    } catch (_) { /* fall back to memory */ }
    const entry = nameCandidates.get(userId);
    if (entry && entry.expiresAt > Date.now()) return entry.candidate;
    return null;
  }

  static async _storeNameCandidate(userId, candidate) {
    nameCandidates.set(userId, { candidate, expiresAt: Date.now() + NAME_CANDIDATE_TTL_SECONDS * 1000 });
    try {
      await redis().set(NAME_CANDIDATE_KEY(userId), { candidate }, NAME_CANDIDATE_TTL_SECONDS);
    } catch (_) { /* memory still holds it */ }
  }

  static async _clearNameCandidate(userId) {
    nameCandidates.delete(userId);
    try {
      await redis().delete(NAME_CANDIDATE_KEY(userId));
    } catch (_) { /* nothing to clear */ }
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
