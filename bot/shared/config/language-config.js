/**
 * Language Configuration for Multi-lingual Support
 * Centralized configuration for all language-specific settings
 *
 * This configuration supports:
 * - Reflective question generation in multiple languages
 * - Language-specific prompts and examples
 * - Cultural adaptations for different regions
 * - Easy addition of new languages
 */

const LANGUAGE_CONFIG = {
  // English
  en: {
    code: 'en',
    name: 'English',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'You are an expert Pakistani master teacher conducting a post-observation reflective conversation.',
      languageInstruction: 'Generate the question in ENGLISH language.',
      examples: {
        question1: {
          focus: "Start with teacher's perspective on a SPECIFIC moment",
          example: "I noticed when you asked about [specific question from transcript], students responded with [specific response]. What were you hoping to achieve in that moment?"
        },
        question2: {
          focus: "Dig into a SPECIFIC pedagogical decision",
          example: "At around the [X]-minute mark, when [specific thing happened], you chose to [specific action]. Walk me through your thinking there."
        },
        question3: {
          focus: "Look forward based on SPECIFIC observation",
          example: "You mentioned [their previous answer]. Thinking about how [specific moment from transcript] went, what might you try differently next time?"
        }
      },
      culturalContext: 'Use examples relevant to Pakistani classroom context',
      codeSwitch: false
    }
  },

  // Urdu
  ur: {
    code: 'ur',
    name: 'اردو',
    direction: 'rtl',
    reflectiveQuestions: {
      systemPrompt: 'آپ ایک ماہر پاکستانی ماسٹر ٹیچر ہیں جو کلاس کے مشاہدے کے بعد بات چیت کر رہے ہیں۔',
      languageInstruction: 'سوال اردو زبان میں تیار کریں۔ تکنیکی اصطلاحات کے لیے انگریزی استعمال کریں اگر ضروری ہو۔',
      examples: {
        question1: {
          focus: "استاد کے نقطہ نظر سے شروع کریں",
          example: "میں نے دیکھا جب آپ نے [مخصوص سوال] کے بارے میں پوچھا، طلباء نے [مخصوص جواب] دیا۔ اس لمحے میں آپ کیا حاصل کرنا چاہتے تھے؟"
        },
        question2: {
          focus: "تدریسی فیصلے کی تفصیل",
          example: "تقریباً [X] منٹ پر، جب [مخصوص واقعہ] ہوا، آپ نے [مخصوص عمل] کا انتخاب کیا۔ اس کے پیچھے آپ کی سوچ کیا تھی؟"
        },
        question3: {
          focus: "مستقبل کی منصوبہ بندی",
          example: "آپ نے [پچھلا جواب] کہا تھا۔ [مخصوص لمحہ] کو دیکھتے ہوئے، اگلی بار آپ کیا مختلف کریں گے؟"
        }
      },
      culturalContext: 'پاکستانی کلاس روم کے تناظر میں مثالیں استعمال کریں',
      codeSwitch: true // Allow natural code-switching between Urdu and English
    }
  },

  // Arabic
  ar: {
    code: 'ar',
    name: 'العربية',
    direction: 'rtl',
    reflectiveQuestions: {
      systemPrompt: 'أنت معلم خبير يجري محادثة تأملية بعد ملاحظة الفصل.',
      languageInstruction: 'قم بإنشاء السؤال باللغة العربية.',
      examples: {
        question1: {
          focus: "ابدأ بمنظور المعلم",
          example: "لاحظت عندما سألت عن [سؤال محدد]، أجاب الطلاب بـ [إجابة محددة]. ما الذي كنت تأمل تحقيقه في تلك اللحظة؟"
        },
        question2: {
          focus: "التعمق في قرار تربوي",
          example: "في حوالي الدقيقة [X]، عندما [حدث شيء محدد]، اخترت [إجراء محدد]. اشرح لي تفكيرك هناك."
        },
        question3: {
          focus: "التطلع إلى المستقبل",
          example: "لقد ذكرت [إجابتهم السابقة]. بالتفكير في كيفية سير [لحظة محددة]، ما الذي قد تجربه بشكل مختلف في المرة القادمة؟"
        }
      },
      culturalContext: 'استخدم أمثلة ذات صلة بسياق الفصل الدراسي في المنطقة العربية',
      codeSwitch: false
    }
  },

  // Spanish
  es: {
    code: 'es',
    name: 'Español',
    direction: 'ltr',
    reflectiveQuestions: {
      systemPrompt: 'Eres un maestro experto realizando una conversación reflexiva post-observación.',
      languageInstruction: 'Genera la pregunta en idioma ESPAÑOL.',
      examples: {
        question1: {
          focus: "Comienza con la perspectiva del maestro",
          example: "Noté cuando preguntaste sobre [pregunta específica], los estudiantes respondieron con [respuesta específica]. ¿Qué esperabas lograr en ese momento?"
        },
        question2: {
          focus: "Profundiza en una decisión pedagógica",
          example: "Alrededor del minuto [X], cuando [algo específico sucedió], elegiste [acción específica]. Explícame tu razonamiento allí."
        },
        question3: {
          focus: "Mirar hacia adelante",
          example: "Mencionaste [su respuesta anterior]. Pensando en cómo fue [momento específico], ¿qué podrías intentar de manera diferente la próxima vez?"
        }
      },
      culturalContext: 'Usa ejemplos relevantes para el contexto del aula',
      codeSwitch: false
    }
  }
};

/**
 * Get language configuration
 * @param {string} languageCode - Language code (en, ur, ar, es)
 * @returns {object} Language configuration object
 */
function getLanguageConfig(languageCode) {
  return LANGUAGE_CONFIG[languageCode] || LANGUAGE_CONFIG.en;
}

/**
 * Get all supported language codes
 * @returns {array} Array of language codes
 */
function getSupportedLanguages() {
  return Object.keys(LANGUAGE_CONFIG);
}

/**
 * Check if language is supported
 * @param {string} languageCode - Language code to check
 * @returns {boolean} True if language is supported
 */
function isLanguageSupported(languageCode) {
  return LANGUAGE_CONFIG.hasOwnProperty(languageCode);
}

module.exports = {
  LANGUAGE_CONFIG,
  getLanguageConfig,
  getSupportedLanguages,
  isLanguageSupported
};