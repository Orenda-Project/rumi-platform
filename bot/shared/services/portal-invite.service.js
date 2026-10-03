/**
 * Portal Invite Service
 * Handles teacher portal invitation token generation and the invite message
 *
 * Responsibilities:
 * - Generate unique portal setup tokens (UUID v4)
 * - Store tokens in database with 7-day expiry
 * - Send multilingual invitation messages on the user's own channel
 * - Validate tokens for portal setup flow
 *
 * The portal signs people in by phone number. Someone who uses only Rumi
 * Messenger signs in with the number their Matrix username carries
 * (@+<digits>); a username that is a name carries none, so no invite is
 * minted for them (see signInNumberFor and docs/channels/matrix.md).
 *
 * Related: TEACHER_PORTAL_IMPLEMENTATION_PLAN.md
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const { identityForUser, parseIdentity } = require('./messaging/user-identity');
const { matrixPhoneNumberFor } = require('../database/bot-helpers');
const { isObserveEnabled, isSchoolLeader } = require('./observe/observe-gate');

/**
 * The phone number this user signs in to the portal with, or null. A Matrix
 * user named by their number has it recorded on their next message
 * (bot-helpers.js), but a coach put on the observe roster may not have
 * written yet, so it is recorded here too, under the same rule: only when no
 * other user holds that number.
 */
async function signInNumberFor(user) {
  if (user.phone_number) return user.phone_number;
  const { data: links } = await supabase
    .from('user_channels')
    .select('channel, channel_user_id')
    .eq('user_id', user.id);
  for (const link of links || []) {
    const phoneNumber = await matrixPhoneNumberFor(link.channel, link.channel_user_id);
    if (phoneNumber) {
      const { error } = await supabase.from('users').update({ phone_number: phoneNumber }).eq('id', user.id);
      if (error) throw error;
      return phoneNumber;
    }
  }
  return null;
}

// Off WhatsApp the number someone signs in with is not the address they chat
// on, so the invite says which number it is. WhatsApp copy is unchanged.
const SIGN_IN_LINE = {
  en: (n) => `You'll sign in with your phone number, ${n}.`,
  ur: (n) => `آپ اپنے فون نمبر ${n} سے لاگ ان کریں گے۔`,
  ar: (n) => `ستسجل الدخول برقم هاتفك ${n}.`,
  es: (n) => `Iniciarás sesión con tu número de teléfono, ${n}.`,
};

// A coach's portal also has the observe view (dashboard/routes/portal-coach.routes.js).
const COACH_LINE = {
  en: 'As a coach, you will also find your classroom observations under *Observations* in the portal menu.',
  ur: 'بطور کوچ، آپ کو پورٹل کے مینو میں *Observations* کے تحت اپنے کلاس روم مشاہدات بھی ملیں گے۔',
  ar: 'بصفتك مدرباً، ستجد أيضاً ملاحظاتك الصفية تحت *Observations* في قائمة البوابة.',
  es: 'Como coach, también encontrarás tus observaciones de aula en *Observations*, en el menú del portal.',
};

class PortalInviteService {
  /** The phone number a user signs in to the portal with, or null (see signInNumberFor above). */
  static async signInNumberFor(user) {
    return signInNumberFor(user);
  }

  /**
   * Send portal invitation to the user on their own channel
   * Creates unique token, stores in database, sends localized message
   *
   * @param {string} userId - User's UUID from database
   * @param {string|null} phoneNumber - Where to send it: the identity the user is
   *   writing from (a WhatsApp number like 15550100001, or "mtx:…" / "slack:…"),
   *   or null to send it to the channel they last used (e.g. from the roster CLI)
   * @param {string} language - User's preferred language ('en', 'ur', 'ar', 'es')
   * @returns {Promise<{success: boolean, token: string, expiresAt: Date, error?: string,
   *   reason?: 'no_sign_in_number'}>}
   */
  static async sendPortalInvite(userId, phoneNumber, language = 'en') {
    try {
      logToFile('📨 Sending portal invitation', { userId, phoneNumber, language });

      const recipient = phoneNumber || await identityForUser(userId);
      if (!recipient) {
        return { success: false, error: 'No channel to reach this user on' };
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, phone_number, role')
        .eq('id', userId)
        .single();
      if (userError || !user) {
        throw userError || new Error('User not found');
      }

      // No number to sign in with → a password set from this link could never
      // be used, so no link is minted (the caller says why).
      const signInNumber = await signInNumberFor(user);
      if (!signInNumber) {
        logToFile('⚠️ Portal invite skipped: no phone number to sign in with', { userId, recipient });
        return { success: false, reason: 'no_sign_in_number', error: 'No phone number to sign in with' };
      }

      // Generate unique token
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

      // Store token in database
      const { error: updateError } = await supabase
        .from('users')
        .update({
          portal_invite_token: token,
          portal_invite_expires_at: expiresAt.toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        logToFile('❌ Error storing portal invite token', { userId, error: updateError });
        throw updateError;
      }

      // Build portal URL. If PORTAL_URL is unset, the feature degrades
      // gracefully — we don't send the invite (no clickable link to send).
      const portalBase = require('../config/branding').portalUrl();
      if (!portalBase) {
        logToFile('⚠️ PORTAL_URL not configured — skipping portal invite', { userId });
        return {
          success: false,
          error: 'PORTAL_URL not configured on this deployment',
        };
      }
      const portalUrl = `${portalBase}/portal/setup/${token}`;

      // Multilingual invitation messages
      const messages = {
        en: `Great! I've created your personal Rumi portal where you can access all your lesson plans, presentations, and coaching reports.

🔗 *Set up your portal:*
${portalUrl}

This link expires in 7 days. Click it to create your password and log in.`,

        ur: `بہت خوب! میں نے آپ کے لیے Rumi پورٹل بنا دیا ہے جہاں آپ اپنے تمام lesson plans، presentations، اور coaching reports دیکھ سکتے ہیں۔

🔗 *پورٹل سیٹ اپ کریں:*
${portalUrl}

یہ لنک 7 دن میں ختم ہو جائے گی۔ اپنا پاسورڈ بنانے اور لاگ ان کرنے کے لیے اسے کلک کریں۔`,

        ar: `رائع! لقد أنشأت بوابة Rumi الشخصية الخاصة بك حيث يمكنك الوصول إلى جميع خطط الدروس والعروض التقديمية وتقارير التدريب.

🔗 *قم بإعداد بوابتك:*
${portalUrl}

تنتهي صلاحية هذا الرابط خلال 7 أيام. انقر عليه لإنشاء كلمة المرور وتسجيل الدخول.`,

        es: `¡Excelente! He creado tu portal personal de Rumi donde puedes acceder a todos tus planes de lección, presentaciones e informes de coaching.

🔗 *Configura tu portal:*
${portalUrl}

Este enlace expira en 7 días. Haz clic en él para crear tu contraseña e iniciar sesión.`
      };

      // Get localized message (fallback to English if language not supported)
      const lang = messages[language] ? language : 'en';
      let message = messages[lang];

      if (!messages[language]) {
        logToFile('⚠️ Unsupported language for portal invite, using English', { language, userId });
      }

      if (parseIdentity(recipient).channel !== 'whatsapp') {
        message += `\n\n${SIGN_IN_LINE[lang](`+${String(signInNumber).replace(/^\+/, '')}`)}`;
      }
      if (isObserveEnabled() && isSchoolLeader(user)) {
        message += `\n\n${COACH_LINE[lang]}`;
      }

      // Through the messaging facade, which routes the identity to its channel
      const sent = await WhatsAppService.sendMessage(recipient, message);
      if (sent === false) {
        throw new Error('The invitation message could not be sent');
      }

      logToFile('✅ Portal invitation sent successfully', {
        userId,
        recipient,
        language,
        token,
        expiresAt: expiresAt.toISOString()
      });

      return {
        success: true,
        token,
        expiresAt
      };
    } catch (error) {
      logToFile('❌ Error sending portal invitation', {
        userId,
        phoneNumber,
        language,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate portal invitation token WITHOUT sending WhatsApp message
   * Used for registration flow where a combined message is sent instead
   *
   * @param {string} userId - User's UUID from database
   * @returns {Promise<{success: boolean, token: string, expiresAt: Date, error?: string}>}
   */
  static async generatePortalToken(userId) {
    try {
      logToFile('🔑 Generating portal token (no message)', { userId });

      // Generate unique token
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

      // Store token in database
      const { error: updateError } = await supabase
        .from('users')
        .update({
          portal_invite_token: token,
          portal_invite_expires_at: expiresAt.toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        logToFile('❌ Error storing portal invite token', { userId, error: updateError });
        throw updateError;
      }

      logToFile('✅ Portal token generated successfully', {
        userId,
        token,
        expiresAt: expiresAt.toISOString()
      });

      return {
        success: true,
        token,
        expiresAt
      };
    } catch (error) {
      logToFile('❌ Error generating portal token', {
        userId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate portal invitation token
   * Checks if token exists, hasn't expired, and portal hasn't been activated yet
   *
   * @param {string} token - Portal invitation token (UUID)
   * @returns {Promise<{valid: boolean, user?: object, error?: string}>}
   */
  static async validateToken(token) {
    try {
      logToFile('🔍 Validating portal invitation token', { token });

      // Query user with this token
      const { data: user, error: queryError } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, portal_activated, portal_invite_expires_at')
        .eq('portal_invite_token', token)
        .single();

      if (queryError || !user) {
        logToFile('❌ Invalid token - not found in database', { token });
        return {
          valid: false,
          error: 'Invalid or expired invitation link'
        };
      }

      // Check if token has expired
      const now = new Date();
      const expiresAt = new Date(user.portal_invite_expires_at);

      if (now > expiresAt) {
        logToFile('❌ Token expired', {
          token,
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString()
        });
        return {
          valid: false,
          error: 'This invitation link has expired. Please contact support for a new link.'
        };
      }

      // Check if portal already activated
      if (user.portal_activated) {
        logToFile('❌ Portal already activated', { token, userId: user.id });
        return {
          valid: false,
          error: 'This portal has already been activated. Please log in instead.'
        };
      }

      logToFile('✅ Token validated successfully', {
        token,
        userId: user.id,
        expiresAt: expiresAt.toISOString()
      });

      return {
        valid: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: user.phone_number
        }
      };
    } catch (error) {
      logToFile('❌ Error validating token', {
        token,
        error: error.message,
        stack: error.stack
      });

      return {
        valid: false,
        error: 'An error occurred while validating your invitation. Please try again.'
      };
    }
  }

  /**
   * Resend portal invitation (if original expired)
   * Generates new token and sends new WhatsApp message
   *
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - User's phone number
   * @param {string} language - User's language
   * @returns {Promise<{success: boolean, token?: string, expiresAt?: Date, error?: string}>}
   */
  static async resendInvitation(userId, phoneNumber, language = 'en') {
    try {
      logToFile('🔄 Resending portal invitation', { userId, phoneNumber });

      // Check if portal already activated
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('portal_activated')
        .eq('id', userId)
        .single();

      if (userError) {
        throw userError;
      }

      if (user.portal_activated) {
        logToFile('⚠️ Cannot resend - portal already activated', { userId });
        return {
          success: false,
          error: 'Portal already activated. Please log in instead.'
        };
      }

      // Generate new token and send invitation
      return await this.sendPortalInvite(userId, phoneNumber, language);
    } catch (error) {
      logToFile('❌ Error resending invitation', {
        userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get registration success message with portal activation
   * Used ONLY after user completes registration form
   *
   * @param {string} firstName - User's first name
   * @param {string} portalSetupToken - Portal setup token (UUID)
   * @param {string} language - User's language preference
   * @returns {string} Combined registration success + portal activation message
   */
  static getRegistrationSuccessWithPortalMessage(firstName, portalSetupToken, language = 'en') {
    const portalBase = require('../config/branding').portalUrl();

    // No portal configured → fall back to a portal-free welcome so we never
    // ship a placeholder URL to the teacher.
    if (!portalBase) {
      const noPortal = {
        en: `Thank you, ${firstName}! Your registration is successful. What would you like to work on next?`,
        ur: `شکریہ، ${firstName}! آپ کی رجسٹریشن کامیاب ہو گئی ہے۔ آگے آپ کس چیز پر کام کرنا چاہیں گے؟`,
        ar: `شكراً، ${firstName}! تم تسجيلك بنجاح. ماذا تريد أن تعمل عليه بعد ذلك؟`,
        es: `¡Gracias, ${firstName}! Tu registro fue exitoso. ¿En qué te gustaría trabajar a continuación?`,
      };
      return noPortal[language] || noPortal.en;
    }

    const portalUrl = `${portalBase}/portal/setup/${portalSetupToken}`;

    const messages = {
      en: `Thank you, ${firstName}! Your registration is successful. I've also activated your Rumi portal.

✅ *Set up your portal here:*
${portalUrl}

Through the portal, you can:
• **Track your growth** - See how your teaching practice evolves over time
• **Review past sessions** - Access all your lesson plans, presentations, and coaching reports
• **Analyze trends** - Understand patterns in your classroom performance with visual dashboards
• **Build your library** - Keep all your teaching resources in one place

This link expires in 7 days. Set up your password now to start tracking your journey.

What would you like to work on next?`,

      ur: `شکریہ، ${firstName}! آپ کی رجسٹریشن کامیاب ہو گئی ہے۔ میں نے آپ کا Rumi پورٹل بھی فعال کر دیا ہے۔

✅ *یہاں اپنا پورٹل سیٹ اپ کریں:*
${portalUrl}

پورٹل کے ذریعے، آپ کر سکتے ہیں:
• **اپنی ترقی ٹریک کریں** - دیکھیں کہ آپ کی تدریسی مشق وقت کے ساتھ کیسے بہتر ہوتی ہے
• **پچھلے sessions دیکھیں** - اپنے تمام lesson plans، presentations، اور coaching reports تک رسائی حاصل کریں
• **رجحانات کا تجزیہ کریں** - visual dashboards کے ساتھ اپنی classroom performance میں patterns سمجھیں
• **اپنی library بنائیں** - اپنے تمام teaching resources ایک جگہ رکھیں

یہ لنک 7 دنوں میں ختم ہو جائے گی۔ اپنے سفر کو ٹریک کرنا شروع کرنے کے لیے ابھی اپنا پاسورڈ سیٹ کریں۔

آگے آپ کس چیز پر کام کرنا چاہیں گے؟`,

      ar: `شكراً، ${firstName}! تم تسجيلك بنجاح. لقد قمت أيضاً بتفعيل بوابة Rumi الخاصة بك.

✅ *قم بإعداد بوابتك هنا:*
${portalUrl}

من خلال البوابة، يمكنك:
• **تتبع نموك** - شاهد كيف تتطور ممارستك التدريسية بمرور الوقت
• **مراجعة الجلسات السابقة** - الوصول إلى جميع خطط الدروس والعروض التقديمية وتقارير التدريب
• **تحليل الاتجاهات** - فهم الأنماط في أدائك الصفي باستخدام لوحات معلومات مرئية
• **بناء مكتبتك** - احتفظ بجميع موارد التدريس في مكان واحد

تنتهي صلاحية هذا الرابط خلال 7 أيام. قم بتعيين كلمة المرور الآن لبدء تتبع رحلتك.

ماذا تريد أن تعمل عليه بعد ذلك؟`,

      es: `¡Gracias, ${firstName}! Tu registro fue exitoso. También he activado tu portal de Rumi.

✅ *Configura tu portal aquí:*
${portalUrl}

A través del portal, puedes:
• **Rastrea tu crecimiento** - Ve cómo evoluciona tu práctica docente con el tiempo
• **Revisa sesiones anteriores** - Accede a todos tus planes de lección, presentaciones e informes de coaching
• **Analiza tendencias** - Comprende patrones en tu desempeño en el aula con paneles visuales
• **Construye tu biblioteca** - Mantén todos tus recursos didácticos en un solo lugar

Este enlace expira en 7 días. Configura tu contraseña ahora para comenzar a rastrear tu trayectoria.

¿En qué te gustaría trabajar a continuación?`
    };

    return messages[language] || messages.en;
  }
}

module.exports = PortalInviteService;
