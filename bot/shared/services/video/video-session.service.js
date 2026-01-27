/**
 * Video Session Service
 *
 * Handles rate limiting and progress updates for video generation.
 */

const { logToFile } = require('../../utils/logger');
const WhatsAppService = require('../whatsapp.service');

// Progress messages in supported languages
const PROGRESS_MESSAGES = {
  en: {
    step1: "🎬 Step 1/4: Creating script and narration...",
    step2: "🎨 Step 2/4: Generating slide images...",
    step3: "🎥 Step 3/4: Creating video animations... (this takes a few minutes)",
    step4: "📦 Step 4/4: Assembling your video...",
    pdfReady: "📊 Your slide deck is ready! Use this for presentations.\n\nVideo with animation coming soon...",
    complete: "🎬 Here's your animated video with narration!",
    rateLimitExceeded: "🎬 You've already created a video today! Video generation is resource-intensive, so each user can create 1 video per day.\n\nYour limit resets at midnight. In the meantime, you can:\n• Try our coaching or reading assessment features\n\nSee you tomorrow! 🌟"
  },
  ur: {
    step1: "🎬 مرحلہ 1/4: اسکرپٹ اور آواز بنا رہے ہیں...",
    step2: "🎨 مرحلہ 2/4: سلائیڈ تصاویر بنا رہے ہیں...",
    step3: "🎥 مرحلہ 3/4: ویڈیو اینیمیشن بنا رہے ہیں... (چند منٹ لگیں گے)",
    step4: "📦 مرحلہ 4/4: ویڈیو مکمل کر رہے ہیں...",
    pdfReady: "📊 آپ کی سلائیڈ ڈیک تیار ہے! پریزنٹیشنز کے لیے استعمال کریں۔\n\nاینیمیشن والی ویڈیو جلد آ رہی ہے...",
    complete: "🎬 یہ آپ کی متحرک ویڈیو ہے!",
    rateLimitExceeded: "🎬 آپ نے آج پہلے ہی ایک ویڈیو بنائی ہے! ہر صارف روزانہ 1 ویڈیو بنا سکتا ہے۔\n\nآپ کی حد آدھی رات کو ری سیٹ ہوگی۔ اس دوران آپ:\n• کوچنگ یا ریڈنگ ٹیسٹ آزما سکتے ہیں\n\nکل ملتے ہیں! 🌟"
  },
  ar: {
    step1: "🎬 الخطوة 1/4: إنشاء النص والتعليق الصوتي...",
    step2: "🎨 الخطوة 2/4: إنشاء صور الشرائح...",
    step3: "🎥 الخطوة 3/4: إنشاء الرسوم المتحركة... (يستغرق بضع دقائق)",
    step4: "📦 الخطوة 4/4: تجميع الفيديو...",
    pdfReady: "📊 مجموعة الشرائح جاهزة! استخدمها للعروض التقديمية.\n\nالفيديو المتحرك قادم قريبًا...",
    complete: "🎬 إليك فيديو متحرك مع التعليق الصوتي!",
    rateLimitExceeded: "🎬 لقد أنشأت فيديو اليوم بالفعل! يمكن لكل مستخدم إنشاء فيديو واحد يومياً.\n\nسيتم إعادة تعيين الحد عند منتصف الليل.\n\nنراك غداً! 🌟"
  },
  es: {
    step1: "🎬 Paso 1/4: Creando guión y narración...",
    step2: "🎨 Paso 2/4: Generando imágenes de diapositivas...",
    step3: "🎥 Paso 3/4: Creando animaciones... (toma unos minutos)",
    step4: "📦 Paso 4/4: Ensamblando tu video...",
    pdfReady: "📊 ¡Tu presentación está lista! Úsala para presentaciones.\n\nEl video animado viene pronto...",
    complete: "🎬 ¡Aquí está tu video animado con narración!",
    rateLimitExceeded: "🎬 ¡Ya has creado un video hoy! Cada usuario puede crear 1 video por día.\n\nTu límite se reinicia a medianoche.\n\n¡Nos vemos mañana! 🌟"
  }
};

class VideoSessionService {

  /**
   * Check if user can generate a video (rate limit check)
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - Optional phone number for bypass check
   * @returns {Object} { allowed: boolean, remaining: number }
   */
  static async checkRateLimit(userId, phoneNumber = null) {
    const RedisService = require('../cache/railway-redis.service');
    const dailyLimit = parseInt(process.env.VIDEO_DAILY_LIMIT || '1');

    // Bypass rate limit for test users (comma-separated list in env var)
    const bypassNumbers = (process.env.RATE_LIMIT_BYPASS_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
    if (phoneNumber && bypassNumbers.includes(phoneNumber)) {
      logToFile('Rate limit bypassed for test user', { userId, phoneNumber });
      return { allowed: true, remaining: 999 };
    }

    try {
      const key = `video:daily:${userId}`;
      const currentCount = await RedisService.get(key);
      const count = parseInt(currentCount || '0');

      if (count >= dailyLimit) {
        return { allowed: false, remaining: 0 };
      }

      return { allowed: true, remaining: dailyLimit - count };
    } catch (error) {
      // Fail open if Redis is down
      logToFile('Redis rate limit check failed, allowing request', {
        userId,
        error: error.message
      });
      return { allowed: true, remaining: 1 };
    }
  }

  /**
   * Increment rate limit counter after video generation starts
   * @param {string} userId - User UUID
   */
  static async incrementRateLimit(userId) {
    const RedisService = require('../cache/railway-redis.service');

    try {
      const key = `video:daily:${userId}`;

      // Calculate seconds until midnight UTC
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const ttlSeconds = Math.floor((midnight - now) / 1000);

      await RedisService.incr(key);
      await RedisService.expire(key, ttlSeconds);

      logToFile('Video rate limit incremented', { userId, ttlSeconds });
    } catch (error) {
      logToFile('Failed to increment rate limit', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Send progress update to user
   * ISSUE #17 FIX: Added deduplication to prevent duplicate messages on SQS retries
   * @param {string} videoRequestId - Video request UUID
   * @param {number} step - Step number (1-4)
   * @param {string} language - User's language preference
   */
  static async sendProgressUpdate(videoRequestId, step, language) {
    const supabase = require('../../config/supabase');
    const RedisService = require('../cache/railway-redis.service');

    try {
      // ISSUE #17 FIX: Check if we already sent this step message
      const stepSentKey = `video:${videoRequestId}:step:${step}`;
      try {
        const alreadySent = await RedisService.get(stepSentKey);
        if (alreadySent) {
          logToFile('Skipping duplicate progress message', { videoRequestId, step });
          return;  // Don't send again
        }
      } catch (redisErr) {
        // If Redis fails, continue anyway (fail open)
        logToFile('Redis check failed, sending message anyway', { error: redisErr.message });
      }

      // Get video request to find user phone number
      const { data: videoRequest, error } = await supabase
        .from('video_requests')
        .select('*, users!video_requests_user_id_fkey(phone_number)')
        .eq('id', videoRequestId)
        .single();

      if (error || !videoRequest) {
        logToFile('Video request not found for progress update', { videoRequestId });
        return;
      }

      const from = videoRequest.users?.phone_number;
      if (!from) return;

      const messages = PROGRESS_MESSAGES[language] || PROGRESS_MESSAGES.en;
      const stepKey = `step${step}`;

      if (messages[stepKey]) {
        await WhatsAppService.sendMessage(from, messages[stepKey]);

        // ISSUE #17 FIX: Mark step as sent with 1 hour TTL
        try {
          await RedisService.setex(stepSentKey, 3600, 'true');
        } catch (redisErr) {
          logToFile('Failed to mark step as sent in Redis', { error: redisErr.message });
        }
      }

      // Update database
      await supabase
        .from('video_requests')
        .update({ current_step: step })
        .eq('id', videoRequestId);

      logToFile('Progress update sent', { videoRequestId, step, language });
    } catch (error) {
      logToFile('Error sending progress update', {
        videoRequestId,
        step,
        error: error.message
      });
    }
  }

  /**
   * Get progress messages for a language
   * @param {string} language - Language code
   * @returns {Object} Progress messages
   */
  static getProgressMessages(language) {
    return PROGRESS_MESSAGES[language] || PROGRESS_MESSAGES.en;
  }
}

module.exports = VideoSessionService;
