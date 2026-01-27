/**
 * Helper Agent Service
 * LLM-powered intelligent assistant that helps users navigate the platform
 * and recover from conversation deadends
 *
 * Purpose:
 * - Detect when users are stuck or confused
 * - Provide contextual guidance based on platform architecture
 * - Suggest next steps based on available services
 * - Handle edge cases gracefully with intelligent fallbacks
 */

const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../utils/constants');
const { logToFile } = require('../utils/logger');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Platform architecture knowledge base for the helper agent
 */
const PLATFORM_KNOWLEDGE = `
# Rumi WhatsApp Bot - Platform Architecture

## Available Services:

### 1. Digital Coaching (Primary Service)
- Upload classroom audio/video for AI-powered teaching analysis
- Receive detailed feedback on OECD Framework criteria
- 3-question reflective conversation
- Comprehensive PDF report with rubric scores
- Commands: Send audio/video directly (no command needed)

### 2. Lesson Plan Generator
- Create 5-phase detailed lesson plans
- Powered by Gamma AI
- Delivered as PDF
- Commands: "Create lesson plan for [topic]" or natural language request

### 3. Presentation Generator
- Create educational presentations
- Powered by Gamma AI
- Delivered as PDF
- Commands: "Create presentation about [topic]" or natural language request

### 4. AI Video Generation
- Create educational explainer videos on any topic
- Multiple visual styles: infographic, whiteboard, cartoon, realistic
- 9 languages supported
- Commands: /video or "create a video about [topic]"

### 5. General Conversation
- Ask teaching questions
- Get educational advice
- Bilingual support (Urdu/English)
- Commands: Just chat naturally

## Key Commands:
- /menu - Show main menu with all options
- /video - Start AI video generation
- /reading test - Start reading assessment
- /language - Change language preference
- /portal - Access teacher portal

## Conversation States:
- AWAITING_MENU_CHOICE - User needs to pick 1-4 from menu
- AWAITING_VIDEO_TOPIC - User providing topic for AI video generation
- AWAITING_LESSON_PLAN - User uploading lesson plan document
- AWAITING_CLASSROOM_AUDIO - User should upload audio/video
- REFLECTIVE_QUESTION_1/2/3 - User in coaching reflection flow

## Registration Flow:
- Triggers AFTER first feature completion (lesson plan, coaching, reading, video)
- Simple question: "What should I call you?"
- Collects only first name - zero friction
- Portal link sent after registration

## Recovery Options:
- Type /menu anytime to return to main menu
- Send new audio/video to start fresh coaching session
- Ask "What can you do?" to see available services
`;

class HelperAgentService {
  /**
   * Detect if user is stuck in a deadend and needs help
   *
   * @param {string} userMessage - User's message
   * @param {string} conversationState - Current conversation state (e.g., 'AWAITING_MENU_CHOICE')
   * @param {Object} context - Additional context (user history, last bot message, etc.)
   * @returns {Promise<boolean>} True if user appears stuck
   */
  static async detectDeadend(userMessage, conversationState, context = {}) {
    try {
      // Heuristic detection for common deadend patterns
      const deadendIndicators = [
        // Confusion indicators
        /what (can|do) you do/i,
        /how (does|do) (this|it) work/i,
        /help/i,
        /stuck/i,
        /confused/i,
        /don'?t understand/i,

        // Repetition indicators
        context.messagesSentInLastMinute > 3,
        context.sameMessageRepeated,

        // Invalid input in awaiting states
        conversationState?.startsWith('AWAITING_') && !context.validInput,

        // Registration-related confusion
        /already registered/i,
        /why register/i,
        /skip registration/i,
      ];

      const isStuck = deadendIndicators.some(indicator => {
        if (typeof indicator === 'boolean') return indicator;
        if (indicator instanceof RegExp) return indicator.test(userMessage);
        return false;
      });

      logToFile('Deadend detection', {
        isStuck,
        userMessage,
        conversationState,
        context
      });

      return isStuck;
    } catch (error) {
      logToFile('Error in deadend detection', { error: error.message });
      return false;
    }
  }

  /**
   * Generate intelligent guidance using GPT-4o
   * Understands platform architecture and suggests next steps
   *
   * @param {string} userMessage - User's message
   * @param {string} conversationState - Current conversation state
   * @param {Object} userContext - User information (name, registration status, etc.)
   * @param {string} language - User's preferred language ('en', 'ur', 'es', 'ar')
   * @returns {Promise<string>} Helpful guidance message
   */
  static async generateGuidance(userMessage, conversationState, userContext = {}, language = 'en') {
    try {
      logToFile('Generating helper agent guidance', {
        userMessage,
        conversationState,
        userContext,
        language
      });

      const systemPrompt = `You are Rumi, a helpful WhatsApp teaching assistant bot for Pakistani teachers. Your role is to guide users who are stuck or confused about what to do next.

${PLATFORM_KNOWLEDGE}

## Your Responsibilities:
1. Understand what the user is trying to do
2. Explain what services are available
3. Provide clear, actionable next steps
4. Be warm, encouraging, and concise
5. Respond in the user's language (${language})

## Context:
- User's current state: ${conversationState || 'Unknown'}
- User's name: ${userContext.firstName || 'Teacher'}
- User registered: ${userContext.isRegistered ? 'Yes' : 'No'}
- User's grade level: ${userContext.grade || 'Not set'}
- User's subject: ${userContext.subject || 'Not set'}

## Guidelines:
- Keep responses under 3 sentences
- Use emojis sparingly (1-2 max)
- Provide specific commands or actions
- If user is in a specific state, explain what's expected
- If user seems lost, suggest /menu to see all options
- Be empathetic to teachers' busy schedules`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const guidance = response.choices[0].message.content.trim();

      logToFile('✅ Helper agent guidance generated', {
        guidance,
        tokensUsed: response.usage.total_tokens
      });

      return guidance;
    } catch (error) {
      logToFile('❌ Error generating helper agent guidance', {
        error: error.message
      });

      // Fallback guidance based on language
      const fallbackMessages = {
        en: "I'm here to help! Try typing /menu to see all available services, or send me classroom audio for AI coaching.",
        ur: "میں مدد کے لیے حاضر ہوں! تمام خدمات دیکھنے کے لیے /menu ٹائپ کریں، یا AI کوچنگ کے لیے کلاس روم آڈیو بھیجیں۔",
        es: "¡Estoy aquí para ayudar! Escribe /menu para ver todos los servicios disponibles, o envíame audio de clase para coaching con IA.",
        ar: "أنا هنا للمساعدة! اكتب /menu لرؤية جميع الخدمات المتاحة، أو أرسل لي تسجيل صوتي للفصل للحصول على التدريب بالذكاء الاصطناعي."
      };

      return fallbackMessages[language] || fallbackMessages.en;
    }
  }

  /**
   * Handle stuck session recovery with intelligent guidance
   *
   * @param {string} userResponse - User's response to recovery prompt
   * @param {Object} stuckSession - Stuck coaching session data
   * @param {string} language - User's preferred language
   * @returns {Promise<Object>} Recovery action { action: 'retry'|'fresh'|'guide', message?: string }
   */
  static async handleStuckSessionRecovery(userResponse, stuckSession, language = 'en') {
    try {
      // Check for explicit numeric responses first
      if (userResponse === '1' || userResponse.toLowerCase().includes('try again') || userResponse.toLowerCase().includes('retry')) {
        return { action: 'retry' };
      }

      if (userResponse === '2' || userResponse.toLowerCase().includes('start fresh') || userResponse.toLowerCase().includes('new')) {
        return { action: 'fresh' };
      }

      // Use LLM to interpret ambiguous responses
      const systemPrompt = `You are helping interpret a user's response to a coaching session recovery prompt.

The user was asked:
"Would you like to:
1️⃣ Try again - I'll re-analyze your lesson
2️⃣ Start fresh - Begin a new coaching session

Reply with 1 or 2"

Their response was: "${userResponse}"

Determine their intent and respond with ONLY ONE of these exact words:
- "retry" if they want option 1 (try again)
- "fresh" if they want option 2 (start fresh)
- "unclear" if you cannot determine their intent

Respond with just one word, nothing else.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userResponse }
        ],
        temperature: 0,
        max_tokens: 10
      });

      const intent = response.choices[0].message.content.trim().toLowerCase();

      if (intent === 'retry') {
        return { action: 'retry' };
      } else if (intent === 'fresh') {
        return { action: 'fresh' };
      } else {
        // Generate clarifying message
        const clarificationMessages = {
          en: "I didn't quite understand. Please reply with:\n*1* to retry the analysis\n*2* to start a new session",
          ur: "میں سمجھ نہیں سکا۔ براہ کرم جواب دیں:\n*1* تجزیہ دوبارہ کرنے کے لیے\n*2* نیا سیشن شروع کرنے کے لیے",
          es: "No entendí bien. Por favor responde con:\n*1* para reintentar el análisis\n*2* para comenzar una nueva sesión",
          ar: "لم أفهم جيدًا. يرجى الرد بـ:\n*1* لإعادة التحليل\n*2* لبدء جلسة جديدة"
        };

        return {
          action: 'guide',
          message: clarificationMessages[language] || clarificationMessages.en
        };
      }
    } catch (error) {
      logToFile('Error in stuck session recovery interpretation', { error: error.message });

      // Fallback to strict numeric check
      if (userResponse === '1') return { action: 'retry' };
      if (userResponse === '2') return { action: 'fresh' };

      return {
        action: 'guide',
        message: "Please reply with *1* or *2*"
      };
    }
  }

  /**
   * Generate escape path suggestions when user is stuck in a state
   *
   * @param {string} conversationState - Current conversation state
   * @param {string} language - User's preferred language
   * @returns {string} Escape path message
   */
  static getEscapePathMessage(conversationState, language = 'en') {
    const escapePaths = {
      AWAITING_MENU_CHOICE: {
        en: "📋 Please choose an option (1-4) from the menu above.\n\nOr type /menu to see the menu again.",
        ur: "📋 براہ کرم اوپر مینو سے ایک آپشن (1-4) منتخب کریں۔\n\nیا دوبارہ مینو دیکھنے کے لیے /menu ٹائپ کریں۔",
        es: "📋 Por favor elige una opción (1-4) del menú de arriba.\n\nO escribe /menu para ver el menú nuevamente.",
        ar: "📋 يرجى اختيار خيار (1-4) من القائمة أعلاه.\n\nأو اكتب /menu لرؤية القائمة مرة أخرى."
      },
      // Issue #28: Renamed from AWAITING_MEDIA_LIBRARY_QUERY to AWAITING_VIDEO_TOPIC
      AWAITING_VIDEO_TOPIC: {
        en: "🎬 What topic would you like a video about?\n\nExample: 'photosynthesis' or 'basics of algebra'\n\nType /menu to return to the main menu.",
        ur: "🎬 آپ کس موضوع پر ویڈیو بنوانا چاہتے ہیں؟\n\nمثال: 'فوٹو سنتھیسز' یا 'الجبرا'\n\nمین مینو پر واپس جانے کے لیے /menu ٹائپ کریں۔",
        es: "🎬 ¿Sobre qué tema te gustaría un video?\n\nEjemplo: 'fotosíntesis' o 'bases del álgebra'\n\nEscribe /menu para volver al menú principal.",
        ar: "🎬 ما الموضوع الذي تريد فيديو عنه؟\n\nمثال: 'التمثيل الضوئي' أو 'أساسيات الجبر'\n\nاكتب /menu للعودة إلى القائمة الرئيسية."
      },
      AWAITING_LESSON_PLAN: {
        en: "📄 Please send your lesson plan as a PDF or Word document.\n\nOr type 'skip' to continue without a lesson plan.",
        ur: "📄 براہ کرم اپنا لیسن پلان PDF یا Word دستاویز کی شکل میں بھیجیں۔\n\nیا لیسن پلان کے بغیر جاری رکھنے کے لیے 'skip' ٹائپ کریں۔",
        es: "📄 Por favor envía tu plan de lección como PDF o documento Word.\n\nO escribe 'skip' para continuar sin plan de lección.",
        ar: "📄 يرجى إرسال خطة الدرس كملف PDF أو Word.\n\nأو اكتب 'skip' للمتابعة بدون خطة درس."
      },
      AWAITING_CLASSROOM_AUDIO: {
        en: "🎙️ Please send your classroom audio or video for AI coaching.\n\nType /menu to explore other services.",
        ur: "🎙️ براہ کرم AI کوچنگ کے لیے اپنی کلاس روم آڈیو یا ویڈیو بھیجیں۔\n\nدیگر خدمات دیکھنے کے لیے /menu ٹائپ کریں۔",
        es: "🎙️ Por favor envía tu audio o video de clase para coaching con IA.\n\nEscribe /menu para explorar otros servicios.",
        ar: "🎙️ يرجى إرسال تسجيل صوتي أو فيديو للفصل للحصول على التدريب بالذكاء الاصطناعي.\n\nاكتب /menu لاستكشاف الخدمات الأخرى."
      }
    };

    const stateMessages = escapePaths[conversationState];
    if (stateMessages) {
      return stateMessages[language] || stateMessages.en;
    }

    // Default escape path
    const defaultMessages = {
      en: "Type /menu to see all available services, or send classroom audio for AI coaching.",
      ur: "تمام دستیاب خدمات دیکھنے کے لیے /menu ٹائپ کریں، یا AI کوچنگ کے لیے کلاس روم آڈیو بھیجیں۔",
      es: "Escribe /menu para ver todos los servicios disponibles, o envía audio de clase para coaching con IA.",
      ar: "اكتب /menu لرؤية جميع الخدمات المتاحة، أو أرسل تسجيل صوتي للفصل للحصول على التدريب بالذكاء الاصطناعي."
    };

    return defaultMessages[language] || defaultMessages.en;
  }

  /**
   * Detect if user is asking about Digital Coach capabilities and provide guidance
   * ⚠️ ADDING A NEW FEATURE? Update shared/config/capabilities.config.js
   * to ensure users can discover it through capability inquiries
   *
   * @param {string} userMessage - User's message
   * @param {string} language - User's preferred language
   * @returns {Promise<{detected: boolean, registrationRequested?: boolean, guidanceMessage?: string}>}
   */
  static async detectCapabilityInquiry(userMessage, language = 'en') {
    try {
      const capabilitiesConfig = require('../config/capabilities.config');

      // Check if this is an ACTUAL REQUEST, not a capability question
      const actualRequestPatterns = [
        'create', 'make', 'generate', 'prepare', 'build',
        'بنائیں', 'تیار کریں',
        'إنشاء', 'أنشئ',
        'crear', 'hacer'
      ];

      const isActualRequest = actualRequestPatterns.some(pattern =>
        userMessage.toLowerCase().includes(pattern)
      );

      if (isActualRequest) {
        // User is making an actual request (e.g., "create a lesson plan on fractions")
        // Don't trigger capability guidance
        logToFile('Actual request detected, skipping capability guidance', { userMessage });
        return { detected: false };
      }

      // Quick keyword filter using config
      const keywords = capabilitiesConfig.detectionKeywords[language] || capabilitiesConfig.detectionKeywords.en;
      const hasCapabilityKeyword = keywords.some(kw =>
        userMessage.toLowerCase().includes(kw.toLowerCase())
      );

      if (!hasCapabilityKeyword) {
        return { detected: false };
      }

      // Check if user is asking about a SPECIFIC capability
      const specificCapability = this._detectSpecificCapability(userMessage, capabilitiesConfig);

      if (specificCapability) {
        // Return specific step-by-step guidance
        const guidanceMessage = await this._getSpecificCapabilityGuidance(specificCapability, language);

        logToFile('✅ Specific capability inquiry detected', {
          userMessage,
          capabilityId: specificCapability.id,
          language
        });

        return {
          detected: true,
          specificCapability: specificCapability.id,
          guidanceMessage
        };
      }

      // General capability inquiry - use GPT to generate response
      const capabilitiesSummary = capabilitiesConfig.capabilities
        .map((cap, index) => `${index + 1}. **${cap.name.en}**: ${cap.description.en}`)
        .join('\n');

      const systemPrompt = `You are a capability detection assistant for the Digital Coach platform.

Digital Coach capabilities:
${capabilitiesSummary}

The user asked: "${userMessage}"

Task:
1. Determine if this is a question about Digital Coach's capabilities
2. If YES, provide a helpful response in language code "${language}" that:
   - Directly answers their question
   - Mentions relevant features
   - Guides them on how to use the feature (mention /menu)
3. If NO (e.g., general chat), respond with just "NO"

Response format:
- If capability question: Start with "YES:" then your helpful response
- If not capability question: Just "NO"`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message.content.trim();

      if (content.startsWith('YES:')) {
        const guidanceMessage = content.replace(/^YES:\s*/i, '').trim();

        logToFile('✅ General capability inquiry detected', {
          userMessage,
          language,
          responseLength: guidanceMessage.length
        });

        return {
          detected: true,
          guidanceMessage: guidanceMessage || await this._getDefaultCapabilityMessage(language)
        };
      }

      return { detected: false };
    } catch (error) {
      logToFile('❌ Error in capability inquiry detection', {
        error: error.message,
        userMessage
      });
      return { detected: false };
    }
  }

  /**
   * Detect which specific capability the user is asking about
   * @private
   */
  static _detectSpecificCapability(userMessage, config) {
    const messageLower = userMessage.toLowerCase();

    // Check each capability's keywords
    for (const capability of config.capabilities) {
      const hasKeyword = capability.keywords.some(kw =>
        messageLower.includes(kw.toLowerCase())
      );

      if (hasKeyword) {
        return capability;
      }
    }

    return null;
  }

  /**
   * Get step-by-step guidance for a specific capability
   * Uses GPT to support any language
   * @private
   */
  static async _getSpecificCapabilityGuidance(capability, language = 'en') {
    try {
      const guidanceTemplates = {
        lesson_plans: {
          instructions: "Explain that users should just describe their lesson topic and grade level. Give 2 example requests. Mention that you'll generate a comprehensive PDF lesson plan.",
          examples: ["Create a lesson plan on fractions for grade 5", "I need a science lesson on photosynthesis for grade 8"]
        },

        presentations: {
          instructions: "Explain that users should describe what presentation they need. Give 2 examples. Mention that you'll generate visual slides as PDF.",
          examples: ["Create a presentation on climate change", "I need slides about the water cycle for kids"]
        },

        coaching: {
          instructions: "Provide 4 clear steps: 1) Record classroom audio with phone, 2) Upload audio here, 3) Reflect with you about the class, 4) Get detailed coaching report. Make it actionable and encouraging.",
          examples: []
        },

        voice_support: {
          instructions: "Confirm that you support voice messages in English, Urdu, Arabic, Spanish and any language. Encourage them to try sending a voice message now.",
          examples: []
        },

        text_support: {
          instructions: "Confirm that you support text messages in any language. Encourage them to just type their message.",
          examples: []
        },

        media_library: {
          instructions: "Explain how to browse educational videos: type 'show me videos' or 'media library', then browse by category or search topics.",
          examples: ["show me videos", "media library"]
        }
      };

      const template = guidanceTemplates[capability.id];
      if (!template) {
        return capability.description[language] || capability.description.en;
      }

      const prompt = `You are Rumi, a helpful teaching assistant. A user asked: "how do I use ${capability.name.en}?"

Respond directly to the user in language code "${language}" following these instructions:
${template.instructions}

${template.examples.length > 0 ? `Include these example requests:\n${template.examples.map(ex => `- "${ex}"`).join('\n')}` : ''}

IMPORTANT:
- Respond AS Rumi directly to the user (don't say "Here's a guide" or use markdown headers like ###)
- Use emojis (📚, 🎨, 🎓, etc.) to make it friendly
- Be concise but actionable
- End with an encouraging call-to-action
- NO meta-commentary or markdown headers`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 400
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logToFile('Error generating capability guidance', { error: error.message });
      return capability.description[language] || capability.description.en;
    }
  }

  /**
   * Get default capability message using GPT (language-agnostic)
   * @private
   */
  static async _getDefaultCapabilityMessage(language = 'en') {
    try {
      const capabilitiesConfig = require('../config/capabilities.config');

      const capabilitiesList = capabilitiesConfig.capabilities.map(cap => ({
        name: cap.name.en,
        description: cap.description.en
      }));

      const prompt = `You are a helpful teaching assistant named Digital Coach. Generate a friendly message in language code "${language}" that lists all your capabilities.

Your capabilities:
${JSON.stringify(capabilitiesList, null, 2)}

Create a message that:
1. Starts with a friendly greeting introducing yourself
2. Lists all capabilities with emojis (use numbered emojis 1️⃣, 2️⃣, etc.)
3. Ends with "Type /menu to see all options!"

Keep it concise and friendly.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 400
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      logToFile('Error generating default capability message', { error: error.message });
      // Fallback
      return "I can help you with lesson plans, presentations, classroom coaching, and more! Type /menu to see all options.";
    }
  }
}

module.exports = HelperAgentService;
