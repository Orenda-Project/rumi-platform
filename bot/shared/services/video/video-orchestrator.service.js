/**
 * Video Orchestrator Service
 *
 * Public API for video generation. Handles user interactions,
 * rate limiting, and coordinates the video generation flow.
 */

const { logToFile } = require('../../utils/logger');
const WhatsAppService = require('../whatsapp.service');
const VideoSessionService = require('./video-session.service');
const VideoJobQueueService = require('./video-job-queue.service');
const OpenAIService = require('../openai.service');
const redisService = require('../cache/railway-redis.service');
const redis = redisService.redis;

// Issue #58 FIX: Extend TTL from 5 min (300s) to 15 min (900s)
// Users may take longer between video flow steps, causing state to expire
const VIDEO_STATE_TTL = 900; // 15 minutes

class VideoOrchestrator {

  /**
   * Initiate a video generation request
   * @param {Object} user - User object from database
   * @param {string} from - WhatsApp phone number
   * @param {string} sessionId - Conversation session ID
   * @param {string} language - User's preferred language
   * @param {string|null} topic - Video topic (if already provided)
   */
  static async initiateVideoRequest(user, from, sessionId, language, topic = null) {
    const supabase = require('../../config/supabase');

    logToFile('Initiating video request', {
      userId: user?.id,
      from,
      topic,
      language
    });

    try {
      // Check feature flag
      if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
        await WhatsAppService.sendMessage(from,
          "Video generation is coming soon! Stay tuned. 🎬"
        );
        return;
      }

      // Check rate limit (pass phone number for bypass check)
      const rateLimitCheck = await VideoSessionService.checkRateLimit(user.id, from);

      if (!rateLimitCheck.allowed) {
        const messages = VideoSessionService.getProgressMessages(language);
        await WhatsAppService.sendMessage(from, messages.rateLimitExceeded);
        logToFile('Video request rate limited', { userId: user.id });
        return;
      }

      // Issue #43: Check queue depth for concurrency control (50 user limit)
      const VideoJobQueueService = require('./video-job-queue.service');
      const MAX_QUEUE_DEPTH = 50;
      const queueDepth = await VideoJobQueueService.getQueueDepth();

      if (queueDepth >= MAX_QUEUE_DEPTH) {
        // Queue is full - reject with friendly message
        const busyMessages = {
          en: "🎬 Our video service is very busy right now. Please try again in 30 minutes.\n\nWe're generating videos for other users and want to ensure quality for everyone!",
          ur: "🎬 ہماری ویڈیو سروس ابھی بہت مصروف ہے۔ براہ کرم 30 منٹ بعد دوبارہ کوشش کریں۔\n\nہم دوسرے صارفین کے لیے ویڈیوز بنا رہے ہیں!",
          ar: "🎬 خدمة الفيديو مشغولة جداً الآن. يرجى المحاولة مرة أخرى بعد 30 دقيقة.",
          es: "🎬 Nuestro servicio de video está muy ocupado ahora. Por favor, inténtelo de nuevo en 30 minutos."
        };
        await WhatsAppService.sendMessage(from, busyMessages[language] || busyMessages.en);
        logToFile('Video request rejected - queue full', { userId: user.id, queueDepth });
        return;
      }

      // Show queue position if queue is deep (>10)
      if (queueDepth > 10) {
        const position = queueDepth + 1;
        const estimatedWait = position * 10;  // ~10 min per video
        const positionMessages = {
          en: `🎬 Starting your video! You're #${position} in queue (~${estimatedWait} min wait).`,
          ur: `🎬 آپ کی ویڈیو شروع ہو رہی ہے! آپ قطار میں #${position} ہیں (~${estimatedWait} منٹ انتظار)۔`,
          ar: `🎬 جاري بدء الفيديو! أنت رقم ${position} في الانتظار (~${estimatedWait} دقيقة).`,
          es: `🎬 ¡Iniciando tu video! Eres el #${position} en la cola (~${estimatedWait} min de espera).`
        };
        await WhatsAppService.sendMessage(from, positionMessages[language] || positionMessages.en);
        logToFile('Video queue position shown', { userId: user.id, position, queueDepth });
      }

      // If no topic provided, ask for it and store state
      if (!topic) {
        await this.askForTopic(from, user.id, sessionId, language);
        return;
      }

      // ISSUE #4: Topic provided - ask for language selection (NEW STEP)
      await this.askForLanguage(from, user.id, sessionId, topic);
      logToFile('Asked for language selection', { userId: user.id, topic });

    } catch (error) {
      logToFile('Error initiating video request', {
        userId: user?.id,
        error: error.message,
        stack: error.stack
      });

      await WhatsAppService.sendMessage(from,
        "Sorry, something went wrong. Please try again later."
      );
    }
  }

  /**
   * Ask user for video topic and store state in Redis
   * @param {string} from - WhatsApp phone number
   * @param {string} userId - User ID for state tracking
   * @param {string} sessionId - Session ID
   * @param {string} language - User's language
   */
  static async askForTopic(from, userId, sessionId, language) {
    const messages = {
      en: "🎬 What topic would you like me to create a video about?\n\nExamples:\n• Gravity and orbits\n• Volume of 3D shapes\n• Photosynthesis\n• The water cycle\n\nReply with your topic:",
      ur: "🎬 آپ کس موضوع پر ویڈیو بنوانا چاہتے ہیں?\n\nمثالیں:\n• کشش ثقل\n• 3D اشکال کا حجم\n• فتح تناسب\n\nاپنا موضوع لکھیں:",
      ar: "🎬 ما الموضوع الذي تريد إنشاء فيديو عنه?\n\nأمثلة:\n• الجاذبية والمدارات\n• حجم الأشكال ثلاثية الأبعاد\n\nاكتب موضوعك:",
      es: "🎬 ¿Sobre qué tema te gustaría que creara un video?\n\nEjemplos:\n• Gravedad y órbitas\n• Volumen de formas 3D\n\nEscribe tu tema:"
    };

    // Store state in Redis - awaiting video topic from this user
    const stateKey = `user:${userId}:awaiting_video_topic`;
    const stateData = JSON.stringify({
      sessionId,
      language,
      from,
      askedAt: new Date().toISOString()
    });
    await redis.setex(stateKey, VIDEO_STATE_TTL, stateData); // Issue #58: 15 minute expiry

    logToFile('Stored awaiting_video_topic state', { userId, sessionId, language });

    await WhatsAppService.sendMessage(from, messages[language] || messages.en);
  }

  /**
   * Check if user is awaiting video topic input
   * @param {string} userId - User ID
   * @returns {Object|null} State data or null
   */
  static async checkAwaitingTopic(userId) {
    const stateKey = `user:${userId}:awaiting_video_topic`;
    const stateData = await redis.get(stateKey);

    if (stateData) {
      return JSON.parse(stateData);
    }
    return null;
  }

  /**
   * Clear awaiting topic state
   * @param {string} userId - User ID
   */
  static async clearAwaitingTopic(userId) {
    const stateKey = `user:${userId}:awaiting_video_topic`;
    await redis.del(stateKey);
    logToFile('Cleared awaiting_video_topic state', { userId });
  }

  // ======================================================================
  // ISSUE #4: Language Selection Step (NEW)
  // Flow: Topic → Language → Customization → Generate
  // ======================================================================

  /**
   * Ask user for video language using WhatsApp Interactive List
   * ISSUE #4: Add language selection step
   * @param {string} from - WhatsApp phone number
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} topic - Video topic (already confirmed)
   */
  static async askForLanguage(from, userId, sessionId, topic) {
    // ISSUE #9: All 9 platform languages supported
    const languageOptions = [
      // Tier 1: Core languages (ElevenLabs TTS)
      { id: 'en', title: 'English', description: 'Video narration in English' },
      { id: 'ur', title: 'Urdu', description: 'اردو میں ویڈیو' },
      { id: 'ar', title: 'Arabic', description: 'فيديو بالعربية' },
      { id: 'es', title: 'Spanish', description: 'Video en español' },

      // Tier 2: Pakistani regional languages (ElevenLabs TTS - with emotion tags)
      { id: 'ps-PK', title: 'Pashto', description: 'پښتو کې ویډیو' },
      { id: 'pa-PK', title: 'Punjabi', description: 'پنجابی وچ ویڈیو' },

      // Tier 2: Pakistani regional languages (Uplift TTS - no emotion tags)
      { id: 'sd-PK', title: 'Sindhi', description: 'سنڌي ۾ ويڊيو' },
      { id: 'bal-PK', title: 'Balochi', description: 'بلوچی ءَ ویڈیو' },

      // Tier 2: Sri Lankan Tamil (ElevenLabs TTS)
      { id: 'ta-LK', title: 'Tamil', description: 'தமிழில் வீடியோ' }
    ];

    // Store state in Redis - awaiting language selection
    const stateKey = `user:${userId}:awaiting_video_language`;
    const stateData = JSON.stringify({
      sessionId,
      topic,
      from,
      askedAt: new Date().toISOString()
    });
    await redis.setex(stateKey, VIDEO_STATE_TTL, stateData); // Issue #58: 15 minute expiry

    logToFile('Stored awaiting_video_language state', { userId, topic });

    // Send interactive list for language selection
    await WhatsAppService.sendInteractiveMessage(from, {
      header: { type: 'text', text: '🌐 Select Video Language' },
      body: { text: `Choose the language for your video about "${topic}"` },
      action: {
        button: 'Select Language',
        sections: [{ title: 'Languages', rows: languageOptions }]
      }
    });
  }

  /**
   * Check if user is awaiting language selection
   * @param {string} userId - User ID
   * @returns {Object|null} State data or null
   */
  static async checkAwaitingLanguage(userId) {
    const stateKey = `user:${userId}:awaiting_video_language`;
    const stateData = await redis.get(stateKey);

    if (stateData) {
      return JSON.parse(stateData);
    }
    return null;
  }

  /**
   * Clear awaiting language state
   * @param {string} userId - User ID
   */
  static async clearAwaitingLanguage(userId) {
    const stateKey = `user:${userId}:awaiting_video_language`;
    await redis.del(stateKey);
    logToFile('Cleared awaiting_video_language state', { userId });
  }

  /**
   * Handle language selection from user
   * ISSUE #9: All 9 platform languages supported
   * @param {Object} user - User object
   * @param {string} from - WhatsApp phone number
   * @param {string} selectedLanguage - Selected language code (en, ur, ar, es, ps-PK, pa-PK, sd-PK, bal-PK, ta-LK)
   * @param {string} sessionId - Session ID
   * @param {string} topic - Video topic
   */
  static async handleLanguageSelection(user, from, selectedLanguage, sessionId, topic) {
    // All 9 platform languages
    const supportedLanguages = ['en', 'ur', 'ar', 'es', 'ps-PK', 'pa-PK', 'sd-PK', 'bal-PK', 'ta-LK'];

    if (!supportedLanguages.includes(selectedLanguage)) {
      logToFile('Invalid language selection', { userId: user.id, selectedLanguage });
      await WhatsAppService.sendMessage(from,
        "Please select a valid language from the list."
      );
      return;
    }

    logToFile('Language selected for video', {
      userId: user.id,
      selectedLanguage,
      topic
    });

    // Clear language state and proceed to customization
    await this.clearAwaitingLanguage(user.id);
    await this.askForCustomization(from, user.id, sessionId, selectedLanguage, topic);
  }

  // ======================================================================
  // END ISSUE #4
  // ======================================================================

  /**
   * Ask user for optional customization (can skip)
   * Uses GPT to generate context-aware suggestions based on the topic
   * @param {string} from - WhatsApp phone number
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} language - User's language
   * @param {string} topic - Video topic
   */
  static async askForCustomization(from, userId, sessionId, language, topic) {
    // Generate context-aware suggestions using GPT
    let suggestions = '';
    try {
      suggestions = await this.generateTopicSuggestions(topic, language);
    } catch (error) {
      logToFile('Error generating topic suggestions, using fallback', { error: error.message });
      // Fallback to generic suggestions
      suggestions = language === 'ur'
        ? '• بچوں کے لیے آسان بنائیں\n• گہرائی میں جائیں'
        : '• Make it simple for beginners\n• Go in-depth with details';
    }

    // Issue #35: Updated wording - there's still style selection after this
    const messages = {
      en: `🎬 Great! I'll create a video about "${topic}".\n\nWould you like me to focus on any specific aspect?\n\n${suggestions}\n\nReply with your preference, or say "skip" to continue.`,
      ur: `🎬 بہت خوب! میں "${topic}" پر ویڈیو بناؤں گا۔\n\nکیا آپ کسی خاص پہلو پر توجہ چاہتے ہیں؟\n\n${suggestions}\n\nجواب دیں یا "skip" لکھیں۔`,
      ar: `🎬 رائع! سأنشئ فيديو عن "${topic}".\n\nهل تريدني التركيز على جانب معين؟\n\n${suggestions}\n\nاكتب تفضيلك أو "skip" للمتابعة.`,
      es: `🎬 ¡Genial! Crearé un video sobre "${topic}".\n\n¿Te gustaría que me enfoque en algún aspecto específico?\n\n${suggestions}\n\nEscribe tu preferencia o "skip" para continuar.`
    };

    // Store state in Redis - awaiting customization from this user
    const stateKey = `user:${userId}:awaiting_video_customization`;
    const stateData = JSON.stringify({
      sessionId,
      language,
      from,
      topic,
      askedAt: new Date().toISOString()
    });
    await redis.setex(stateKey, VIDEO_STATE_TTL, stateData); // Issue #58: 15 minute expiry

    logToFile('Stored awaiting_video_customization state', { userId, topic });

    await WhatsAppService.sendMessage(from, messages[language] || messages.en);
  }

  /**
   * Generate context-aware topic suggestions using GPT
   * @param {string} topic - The video topic
   * @param {string} language - User's language
   * @returns {string} Bullet-pointed suggestions
   */
  static async generateTopicSuggestions(topic, language) {
    const languageNames = {
      en: 'English',
      ur: 'Urdu',
      ar: 'Arabic',
      es: 'Spanish'
    };
    const langName = languageNames[language] || 'English';

    const response = await OpenAIService.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an educational content expert. Given a topic, suggest 3-4 specific aspects a K-12 educational video could focus on. Keep suggestions brief (5-10 words each). Respond ONLY with bullet points (using •), no intro text. Respond in ${langName}.`
        },
        {
          role: 'user',
          content: `Topic: "${topic}"\n\nSuggest 3-4 specific aspects to focus on for an educational video:`
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const suggestions = response.choices[0].message.content.trim();
    logToFile('Generated topic suggestions', { topic, language, suggestions });
    return suggestions;
  }

  /**
   * Check if user is awaiting customization input
   * @param {string} userId - User ID
   * @returns {Object|null} State data or null
   */
  static async checkAwaitingCustomization(userId) {
    const stateKey = `user:${userId}:awaiting_video_customization`;
    const stateData = await redis.get(stateKey);

    if (stateData) {
      return JSON.parse(stateData);
    }
    return null;
  }

  /**
   * Clear awaiting customization state
   * @param {string} userId - User ID
   */
  static async clearAwaitingCustomization(userId) {
    const stateKey = `user:${userId}:awaiting_video_customization`;
    await redis.del(stateKey);
    logToFile('Cleared awaiting_video_customization state', { userId });
  }

  // ======================================================================
  // ISSUE #35: Style Selection Step (NEW)
  // Flow: Topic → Language → Customization → Style → Generate
  // ======================================================================

  /**
   * Ask user for video style using WhatsApp Carousel Template
   * Issue #35: Video Style Selection via WhatsApp Carousel
   * @param {string} from - WhatsApp phone number
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} language - User's language
   * @param {string} topic - Video topic
   * @param {string|null} customization - User's customization preference
   */
  static async askForStyle(from, userId, sessionId, language, topic, customization) {
    // Store state in Redis - awaiting style selection
    const stateKey = `user:${userId}:awaiting_video_style`;
    const stateData = JSON.stringify({
      sessionId,
      topic,
      language,
      customization,
      from,
      askedAt: new Date().toISOString()
    });
    await redis.setex(stateKey, VIDEO_STATE_TTL, stateData); // Issue #58: 15 minute expiry

    logToFile('Stored awaiting_video_style state', { userId, topic, customization });

    // Send style carousel
    await WhatsAppService.sendStyleCarousel(from);
  }

  /**
   * Check if user is awaiting style selection
   * @param {string} userId - User ID
   * @returns {Object|null} State data or null
   */
  static async checkAwaitingStyle(userId) {
    const stateKey = `user:${userId}:awaiting_video_style`;
    const stateData = await redis.get(stateKey);

    if (stateData) {
      return JSON.parse(stateData);
    }
    return null;
  }

  /**
   * Clear awaiting style state
   * @param {string} userId - User ID
   */
  static async clearAwaitingStyle(userId) {
    const stateKey = `user:${userId}:awaiting_video_style`;
    await redis.del(stateKey);
    logToFile('Cleared awaiting_video_style state', { userId });
  }

  /**
   * Handle style selection from carousel button
   * Issue #35: Parse style from button payload and start generation
   * @param {Object} user - User object
   * @param {string} from - WhatsApp phone number
   * @param {string} selectedStyle - Selected style (photorealistic, infographic, cartoon, sketch)
   * @param {string} sessionId - Session ID
   * @param {string} topic - Video topic
   * @param {string} language - User's language
   * @param {string|null} customization - User's customization preference
   */
  static async handleStyleSelection(user, from, selectedStyle, sessionId, topic, language, customization) {
    const validStyles = ['photorealistic', 'infographic', 'cartoon', 'sketch'];

    if (!validStyles.includes(selectedStyle)) {
      logToFile('Invalid style selection', { userId: user.id, selectedStyle });
      await WhatsAppService.sendMessage(from,
        "Please select a valid style from the carousel."
      );
      return;
    }

    logToFile('Style selected for video', {
      userId: user.id,
      selectedStyle,
      topic,
      customization
    });

    // Clear style state and proceed to generation
    await this.clearAwaitingStyle(user.id);
    await this.startGeneration(user, from, sessionId, language, topic, customization, selectedStyle);
  }

  // ======================================================================
  // END ISSUE #35
  // ======================================================================

  /**
   * Start actual video generation after style selection
   * Issue #35: Now accepts style parameter
   * @param {Object} user - User object
   * @param {string} from - WhatsApp phone number
   * @param {string} sessionId - Session ID
   * @param {string} language - User's language
   * @param {string} topic - Video topic
   * @param {string|null} customization - User's customization (null if skipped)
   * @param {string} style - Video style (photorealistic, infographic, cartoon, sketch)
   */
  static async startGeneration(user, from, sessionId, language, topic, customization = null, style = 'infographic') {
    const supabase = require('../../config/supabase');

    try {
      // Create video request in database
      // Issue #35: Now includes style column
      const { data: videoRequest, error } = await supabase
        .from('video_requests')
        .insert({
          user_id: user.id,
          session_id: sessionId,
          topic,
          language,
          customization,
          style,  // Issue #35: Store selected style
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        logToFile('Error creating video request', { error: error.message });
        throw error;
      }

      const videoRequestId = videoRequest.id;
      logToFile('Video request created', { videoRequestId, topic, customization, language, style });

      // Increment rate limit
      await VideoSessionService.incrementRateLimit(user.id);

      // Send confirmation message
      await this.sendStartConfirmation(from, language, topic, style);

      // Queue for async processing
      // Issue #35: Include style in job data
      await VideoJobQueueService.queueGeneration(videoRequestId, {
        userId: user.id,
        from,
        topic,
        language,
        customization,
        style,  // Issue #35: Pass style to worker
        sessionId
      });

      logToFile('Video generation queued', { videoRequestId, style });

    } catch (error) {
      logToFile('Error starting video generation', {
        userId: user?.id,
        error: error.message,
        stack: error.stack
      });

      await WhatsAppService.sendMessage(from,
        "Sorry, something went wrong. Please try again later."
      );
    }
  }

  /**
   * Send start confirmation to user
   * Issue #35: Now mentions selected style
   * @param {string} from - WhatsApp phone number
   * @param {string} language - User's language
   * @param {string} topic - Video topic
   * @param {string} style - Selected style (photorealistic, infographic, cartoon, sketch)
   */
  static async sendStartConfirmation(from, language, topic, style = 'infographic') {
    // Style display names for user-friendly messages
    const styleNames = {
      en: {
        photorealistic: 'Photorealistic',
        infographic: 'Infographic',
        cartoon: 'Cartoon',
        sketch: 'Sketch'
      },
      ur: {
        photorealistic: 'حقیقی تصویری',
        infographic: 'انفوگرافک',
        cartoon: 'کارٹون',
        sketch: 'خاکہ'
      },
      ar: {
        photorealistic: 'صور واقعية',
        infographic: 'إنفوجرافيك',
        cartoon: 'رسوم متحركة',
        sketch: 'رسم تخطيطي'
      },
      es: {
        photorealistic: 'Fotorrealista',
        infographic: 'Infográfico',
        cartoon: 'Dibujo animado',
        sketch: 'Boceto'
      }
    };

    const styleName = (styleNames[language] || styleNames.en)[style] || style;

    const messages = {
      en: `🎬 Starting video generation for "${topic}"!\n\n🎨 Style: ${styleName}\n\nThis takes about 10-12 minutes. I'll send you updates as each step completes.`,
      ur: `🎬 "${topic}" کے لیے ویڈیو بنانا شروع!\n\n🎨 انداز: ${styleName}\n\nیہ تقریباً 10-12 منٹ لے گا۔ میں آپ کو ہر مرحلے کی اپ ڈیٹ بھیجوں گا۔`,
      ar: `🎬 بدء إنشاء فيديو عن "${topic}"!\n\n🎨 النمط: ${styleName}\n\nيستغرق هذا حوالي 10-12 دقيقة. سأرسل لك تحديثات عند اكتمال كل خطوة.`,
      es: `🎬 ¡Comenzando la generación de video para "${topic}"!\n\n🎨 Estilo: ${styleName}\n\nEsto toma aproximadamente 10-12 minutos. Te enviaré actualizaciones a medida que se complete cada paso.`
    };

    await WhatsAppService.sendMessage(from, messages[language] || messages.en);
  }

  /**
   * Extract topic from a natural language message
   * @param {string} message - User's message
   * @param {string} language - User's language
   * @returns {string|null} Extracted topic or null
   */
  static async extractTopicFromMessage(message, language) {
    try {
      const response = await OpenAIService.createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Extract the video topic from the user message. Return ONLY the topic, nothing else. If no clear topic is found, return null. Examples:\n- "make me a video about gravity" → "gravity"\n- "create a video on photosynthesis" → "photosynthesis"\n- "ویڈیو بناؤ volume کی" → "volume"'
          },
          { role: 'user', content: message }
        ],
        max_tokens: 50,
        temperature: 0.3
      });

      const topic = response.choices[0].message.content.trim();

      if (topic.toLowerCase() === 'null' || topic === '') {
        return null;
      }

      return topic;
    } catch (error) {
      logToFile('Error extracting topic', { message, error: error.message });
      return null;
    }
  }

  /**
   * Handle topic submission from user
   * @param {Object} user - User object
   * @param {string} from - WhatsApp phone number
   * @param {string} topic - The topic user provided
   * @param {string} sessionId - Session ID
   * @param {string} language - User's language
   */
  static async handleTopicSubmission(user, from, topic, sessionId, language) {
    // Re-use initiateVideoRequest with the topic
    await this.initiateVideoRequest(user, from, sessionId, language, topic);
  }
}

module.exports = VideoOrchestrator;
