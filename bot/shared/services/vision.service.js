/**
 * Vision Service - GPT-4.1 Mini Multimodal Image Analysis
 *
 * Handles image analysis for the Rumi WhatsApp Bot.
 * Teachers can send images and receive AI-powered analysis.
 *
 * @module services/vision
 * @version 1.0.0
 * @since v2.9.34
 */

const { getClient } = require('./llm-client');
const { logEvent } = require('../utils/structured-logger');
const { OPENAI_API_KEY } = require('../utils/constants');

const openai = getClient();

// Configuration - use gpt-4.1-mini for speed + vision + multilingual
const CONFIG = {
  analysisModel: process.env.VISION_MODEL || 'gpt-4.1-mini',
  defaultDetail: 'low',
  maxTokens: 1000,
  timeout: 60000,
};

const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Estimate token cost for an image based on OpenAI's vision pricing
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {string} detail - 'low' or 'high'
 * @returns {number} Estimated tokens
 */
function estimateImageTokens(width, height, detail = 'low') {
  if (detail === 'low') return 85;

  // High detail calculation per OpenAI docs
  const maxDim = 2048;
  let w = width, h = height;

  // Step 1: Scale to fit 2048x2048
  if (w > maxDim || h > maxDim) {
    const scale = Math.min(maxDim / w, maxDim / h);
    w = Math.floor(w * scale);
    h = Math.floor(h * scale);
  }

  // Step 2: Scale so shortest side is 768
  const shortSide = Math.min(w, h);
  if (shortSide > 768) {
    const scale = 768 / shortSide;
    w = Math.floor(w * scale);
    h = Math.floor(h * scale);
  }

  // Step 3: Count 512px tiles
  const tilesX = Math.ceil(w / 512);
  const tilesY = Math.ceil(h / 512);

  return 85 + (170 * tilesX * tilesY);
}

/**
 * Build language-aware system prompt for image analysis
 * @param {string} language - Language code
 * @param {object} context - Additional context
 * @returns {string} System prompt
 */
function buildSystemPrompt(language, context = {}) {
  const basePrompts = {
    en: `You are Rumi, an AI teaching assistant helping Pakistani teachers. Analyze educational images constructively. Be encouraging, identify strengths and areas for improvement, suggest actionable next steps. Keep responses concise for WhatsApp.`,

    ur: `آپ رومی ہیں، ایک AI تدریسی معاون جو پاکستانی اساتذہ کی مدد کرتی ہیں۔ تعلیمی تصاویر کا تعمیری تجزیہ کریں۔ حوصلہ افزائی کریں، طاقتوں اور بہتری کے شعبوں کی نشاندہی کریں، قابل عمل اقدامات تجویز کریں۔ واٹس ایپ کے لیے مختصر جوابات دیں۔`,

    ar: `أنت رومي، مساعدة تعليمية تساعد المعلمين الباكستانيين. حلل الصور التعليمية بشكل بناء. كن مشجعًا، حدد نقاط القوة ومجالات التحسين، اقترح خطوات قابلة للتنفيذ.`,

    es: `Eres Rumi, una asistente de enseñanza que ayuda a maestros pakistaníes. Analiza imágenes educativas de manera constructiva. Sé alentadora, identifica fortalezas y áreas de mejora, sugiere pasos accionables.`,

    'bal-PK': `تو رومی ئے، ایک AI تدریسی معاون کہ پاکستانی اُستاداں ءَ کُمک کنت۔ تعلیمی تصویراں ءِ تعمیری تجزیہ کن۔ حوصلہ دے، طاقتاں اتے بہتری ءِ جاگہاں ءَ پچان، قابلِ عمل تجویزاں دے۔`,

    'sd-PK': `تون رومي آهين، هڪ AI تعليمي معاون جيڪا پاڪستاني استادن جي مدد ڪندي آهي۔ تعليمي تصويرن جو تعميري تجزيو ڪر۔ حوصلا افزائي ڪر، طاقتن ۽ بهتري جي علائقن کي سڃاڻ، عملي قدمن جي صلاح ڏي۔`,

    'ps-PK': `ته رومي یې، یوه AI تدریسي معاونه چې پاکستاني استادانو سره مرسته کوي۔ تعلیمي عکسونه په جوړونکي توګه تحلیل کړه۔ هڅونه وکړه، ځواکونه او پرمختګ ساحې وپیژنه، عملي ګامونه وړاندیز کړه۔`,

    'pa-PK': `تو رومی ہیں، اک AI تدریسی معاون جو پاکستانی استاداں دی مدد کردی اے۔ تعلیمی تصویراں دا تعمیری تجزیہ کر۔ حوصلہ دے، طاقتاں تے بہتری دے علاقیاں نوں پچھان، عملی قدماں دی صلاح دے۔`,

    'ta-LK': `நீங்கள் ரூமி, பாகிஸ்தான் ஆசிரியர்களுக்கு உதவும் AI கற்பித்தல் உதவியாளர். கல்வி படங்களை ஆக்கபூர்வமாக பகுப்பாய்வு செய்யுங்கள். ஊக்கப்படுத்துங்கள், பலங்களையும் மேம்பாட்டுப் பகுதிகளையும் அடையாளம் காணுங்கள்.`,
  };

  return basePrompts[language] || basePrompts.en;
}

/**
 * Analyze image using GPT-4.1 Mini vision capabilities
 * @param {Buffer} imageBuffer - Image data
 * @param {string} mimeType - MIME type of the image
 * @param {object} options - Analysis options
 * @returns {Promise<{success: boolean, analysis?: string, error?: string, usage?: object}>}
 */
async function analyzeImage(imageBuffer, mimeType, options = {}) {
  const startTime = Date.now();
  const {
    prompt = 'Please analyze this image and describe what you see.',
    detail = CONFIG.defaultDetail,
    language = 'en',
    context = {},
  } = options;

  logEvent('vision.analysis.started', {
    mimeType,
    imageSize: imageBuffer.length,
    detail,
    language,
    model: CONFIG.analysisModel,
  });

  // Validate MIME type
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return {
      success: false,
      error: `Unsupported image type: ${mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(', ')}`,
    };
  }

  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    const systemPrompt = buildSystemPrompt(language, context);

    const response = await openai.chat.completions.create({
      model: CONFIG.analysisModel,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail },
            },
          ],
        },
      ],
      max_tokens: CONFIG.maxTokens,
      temperature: 0.7,
    });

    const result = {
      success: true,
      analysis: response.choices[0].message.content,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      model: CONFIG.analysisModel,
      detail,
    };

    logEvent('vision.analysis.completed', {
      durationMs: Date.now() - startTime,
      tokens: result.usage.totalTokens,
      model: CONFIG.analysisModel,
    });

    return result;

  } catch (error) {
    logEvent('vision.analysis.failed', {
      durationMs: Date.now() - startTime,
      errorType: error.name,
      errorMessage: error.message,
    });

    return { success: false, error: error.message };
  }
}

/**
 * Analyze image with retry and exponential backoff
 * @param {Buffer} imageBuffer - Image data
 * @param {string} mimeType - MIME type
 * @param {object} options - Analysis options
 * @param {number} maxRetries - Maximum retry attempts (default: 2)
 * @returns {Promise<{success: boolean, analysis?: string, error?: string}>}
 */
async function analyzeWithRetry(imageBuffer, mimeType, options = {}, maxRetries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await analyzeImage(imageBuffer, mimeType, options);

    if (result.success) return result;

    lastError = result.error;

    logEvent('vision.analysis.retry', {
      attempt: attempt + 1,
      maxRetries,
      error: lastError,
    });

    if (attempt < maxRetries) {
      // Exponential backoff: 2s, 4s
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  return { success: false, error: lastError };
}

module.exports = {
  analyzeImage,
  analyzeWithRetry,
  estimateImageTokens,
  buildSystemPrompt,
  SUPPORTED_MIME_TYPES,
  CONFIG,
};
