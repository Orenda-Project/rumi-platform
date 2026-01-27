/**
 * System Messages Library
 *
 * Complete localization of all system messages for 9 languages.
 * Ensures ALL system messages exist in all supported languages.
 *
 * Languages: en, ur, ar, es, bal-PK, sd-PK, ps-PK, pa-PK, ta-LK
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const SYSTEM_MESSAGES = {
  // Recovery/Reset
  freshStart: {
    en: "OK! Starting fresh. How can I help you today?",
    ur: "ٹھیک ہے! نیا آغاز کرتے ہیں۔ آج میں آپ کی کیسے مدد کر سکتی ہوں؟",
    'bal-PK': "ٹھیک انت! نوکیں شروع کنگ۔ من شما ءِ کمک چون کن کیا؟",
    'sd-PK': "ٺيڪ آهي! نئين شروعات ڪريون۔ اڄ مان توهان جي ڪيئن مدد ڪري سگهان ٿي؟",
    'ps-PK': "سمه ده! له سره پیل کوو۔ زه تاسو سره نن څنګه مرسته کولی شم؟",
    'pa-PK': "ٹھیک اے! نویں شروع کردے آں۔ اج میں تہاڈی کیویں مدد کر سکدی آں؟",
    ar: "حسناً! نبدأ من جديد. كيف يمكنني مساعدتك اليوم؟",
    es: "¡De acuerdo! Empecemos de nuevo. ¿Cómo puedo ayudarte hoy?",
    'ta-LK': "சரி! புதிதாக தொடங்குவோம். இன்று உங்களுக்கு எப்படி உதவ முடியும்?"
  },

  // Language switch confirmation
  languageSwitched: {
    en: "I've switched to English. How can I help you today?",
    ur: "میں نے اردو میں تبدیل کر دیا ہے۔ آج میں آپ کی کیسے مدد کر سکتی ہوں؟",
    'bal-PK': "من بلوچی ءَ بدل کتگ۔ من شما ءِ کمک چون کن کیا؟",
    'sd-PK': "مون سنڌي ۾ تبديل ڪيو آهي۔ مان توهان جي ڪيئن مدد ڪري سگهان ٿي؟",
    'ps-PK': "ما پښتو ته بدل کړه۔ زه تاسو سره څنګه مرسته کولی شم؟",
    'pa-PK': "میں پنجابی وچ بدل دتا اے۔ میں تہاڈی کیویں مدد کر سکدی آں؟",
    ar: "لقد تحولت إلى العربية. كيف يمكنني مساعدتك اليوم؟",
    es: "He cambiado al español. ¿Cómo puedo ayudarte hoy?",
    'ta-LK': "நான் தமிழுக்கு மாறிவிட்டேன். இன்று உங்களுக்கு எப்படி உதவ முடியும்?"
  },

  // Empty transcription
  emptyTranscription: {
    en: "Sorry, I couldn't hear your message clearly. Could you try again?",
    ur: "معذرت، میں آپ کا پیغام واضح طور پر نہیں سن سکی۔ دوبارہ کوشش کریں؟",
    'bal-PK': "معذرت، من شما ءِ پیام صاف نہ اشکتگ۔ دوبارہ کوشش کنیت؟",
    'sd-PK': "معذرت، مان توهان جو پيغام صاف نہ ٻڌي سگهيس۔ ٻيهر ڪوشش ڪندا؟",
    'ps-PK': "معذرت، ما ستاسو پیغام روښانه نه واورید۔ بیا هڅه وکړئ؟",
    'pa-PK': "معذرت، میں تہاڈا پیغام صاف نئیں سن سکی۔ دوبارہ کوشش کرو؟",
    ar: "عذراً، لم أتمكن من سماع رسالتك بوضوح. هل يمكنك المحاولة مرة أخرى؟",
    es: "Lo siento, no pude escuchar tu mensaje claramente. ¿Podrías intentarlo de nuevo?",
    'ta-LK': "மன்னிக்கவும், உங்கள் செய்தியை தெளிவாக கேட்க முடியவில்லை. மீண்டும் முயற்சிக்க முடியுமா?"
  },

  // Processing/Loading
  processingLessonPlan: {
    en: "Creating your lesson plan now. This will take about a minute...",
    ur: "آپ کا سبق کا منصوبہ بنا رہی ہوں۔ ایک منٹ لگے گا...",
    'bal-PK': "شما ءِ lesson plan جوڑ کنگ ءَ ہان۔ ایک منٹ صبر کنیت...",
    'sd-PK': "توهان جو سبق جو منصوبو ٺاهي رهيو آهيان۔ هڪ منٽ لڳندو...",
    'ps-PK': "ستاسو د درس پلان جوړوم۔ یوه دقیقه به ونیسي...",
    'pa-PK': "تہاڈا سبق دا منصوبہ بنا رہی آں۔ اک منٹ لگے گا...",
    ar: "أقوم بإنشاء خطة الدرس الآن. سيستغرق هذا دقيقة تقريباً...",
    es: "Creando tu plan de lección ahora. Tomará aproximadamente un minuto...",
    'ta-LK': "உங்கள் பாட திட்டத்தை இப்போது உருவாக்குகிறேன். இது ஒரு நிமிடம் எடுக்கும்..."
  },

  // General error
  generalError: {
    en: "Something went wrong. Let me try again.",
    ur: "کچھ غلط ہو گیا۔ میں دوبارہ کوشش کرتی ہوں۔",
    'bal-PK': "کچھ غلط بوت۔ من دوبارہ کوشش کنان۔",
    'sd-PK': "ڪجهه غلط ٿي ويو۔ مان ٻيهر ڪوشش ڪريان ٿي۔",
    'ps-PK': "یو څه غلط شول۔ راځه بیا هڅه وکړم۔",
    'pa-PK': "کجھ غلط ہو گیا۔ میں دوبارہ کوشش کردی آں۔",
    ar: "حدث خطأ ما. دعني أحاول مرة أخرى.",
    es: "Algo salió mal. Déjame intentarlo de nuevo.",
    'ta-LK': "ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சிக்கிறேன்."
  },

  // Audio too long
  audioTooLong: {
    en: "Your voice message is quite long. Could you send a shorter one?",
    ur: "آپ کا وائس میسج کافی لمبا ہے۔ تھوڑا چھوٹا بھیج سکتے ہیں؟",
    'bal-PK': "شما ءِ voice message بُت درانگ اِنت۔ کمتر بفرستیت؟",
    'sd-PK': "توهان جو آواز پيغام ڊگهو آهي۔ ٿورو ننڍو موڪلي سگهو ٿا؟",
    'ps-PK': "ستاسو غږیز پیغام ډېر اوږد دی۔ لنډ یو لېږلی شئ؟",
    'pa-PK': "تہاڈا voice message بہت لمبا اے۔ تھوڑا چھوٹا بھیج سکدے او؟",
    ar: "رسالتك الصوتية طويلة جداً. هل يمكنك إرسال رسالة أقصر؟",
    es: "Tu mensaje de voz es bastante largo. ¿Podrías enviar uno más corto?",
    'ta-LK': "உங்கள் குரல் செய்தி மிகவும் நீளமானது. சிறிய ஒன்றை அனுப்ப முடியுமா?"
  },

  // Coaching session prompts
  startCoaching: {
    en: "Great! Let's start your coaching session. Tell me about your teaching today.",
    ur: "بہت اچھا! آئیے آپ کی coaching session شروع کریں۔ آج کی تدریس کے بارے میں بتائیں۔",
    'bal-PK': "شاندار! آئیں coaching شروع کنگ۔ شما ءِ تدریس ءِ بارہ ءَ بگوشیت۔",
    'sd-PK': "واه! اچو coaching شروع ڪريون۔ اڄ جي تدريس بابت ٻڌايو۔",
    'ps-PK': "ډېر ښه! راځئ چې ستاسو coaching session پیل کړو۔ د نن تدریس په اړه راته ووایئ۔",
    'pa-PK': "بہت ودھیا! چلو coaching session شروع کردے آں۔ اج دی تدریس بارے دسو۔",
    ar: "رائع! لنبدأ جلسة التدريب الخاصة بك. أخبرني عن تدريسك اليوم.",
    es: "¡Genial! Comencemos tu sesión de coaching. Cuéntame sobre tu enseñanza hoy.",
    'ta-LK': "அருமை! உங்கள் பயிற்சி அமர்வைத் தொடங்குவோம். இன்றைய கற்பித்தல் பற்றி சொல்லுங்கள்."
  },

  // Encouragement
  encouragement: {
    en: "You're doing great! Keep up the good work.",
    ur: "شاباش! بہت اچھا کام کر رہے ہیں۔ کوشش جاری رکھیں۔",
    'bal-PK': "بُت جوان! شما ءِ کوشش شاندار اِنت۔ ہمے وڑا دیم بدیت۔",
    'sd-PK': "واه واه! تمام سٺو ڪم ڪري رهيا آهيو۔ جاري رکو۔",
    'ps-PK': "ډېر ښه! تاسو ښه کار کوئ۔ دې ته دوام ورکړئ۔",
    'pa-PK': "شاباش یار! بہت ودھیا کم کر رہے او۔ ایہی طرح جاری رکھو۔",
    ar: "أحسنت! استمر في العمل الجيد.",
    es: "¡Lo estás haciendo muy bien! Sigue así.",
    'ta-LK': "நன்றாக செய்கிறீர்கள்! தொடர்ந்து இப்படியே செய்யுங்கள்."
  },

  // Language nudge
  languageNudge: {
    en: "I can also talk to you in the language you feel most comfortable in. Type /language to see which languages are available.",
    ur: "میں آپ سے اس زبان میں بھی بات کر سکتی ہوں جس میں آپ راحت محسوس کریں۔ /language ٹائپ کریں۔",
    'bal-PK': "من شما گوں آں زبان ءَ ہم گپ کن کناں کہ شما راحت محسوس کنیت۔ /language ٹائپ کنیت۔",
    'sd-PK': "مان توهان سان ان ٻولي ۾ به ڳالهائي سگهان ٿي جنهن ۾ توهان آرام محسوس ڪريو۔ /language ٽائيپ ڪريو۔",
    'ps-PK': "زه تاسو سره په هغه ژبه هم خبرې کولی شم چې تاسو ورسره راحته یاست۔ /language ټایپ کړئ۔",
    'pa-PK': "میں تہاڈے نال اوس زبان وچ وی گل کر سکدی آں جس وچ تسیں آرام محسوس کردے او۔ /language ٹائپ کرو۔",
    ar: "يمكنني أيضاً التحدث معك باللغة التي تشعر براحة أكثر فيها. اكتب /language لمعرفة اللغات المتاحة.",
    es: "También puedo hablarte en el idioma en el que te sientas más cómodo. Escribe /language para ver los idiomas disponibles.",
    'ta-LK': "உங்களுக்கு வசதியான மொழியிலும் நான் பேசலாம். /language என்று தட்டச்சு செய்யுங்கள்."
  },

  // Thank you
  thankYou: {
    en: "Thank you! Is there anything else I can help you with?",
    ur: "شکریہ! کیا اور کوئی بات ہے جس میں میں مدد کر سکتی ہوں؟",
    'bal-PK': "منتوار! دگہ کارے ہست کہ من کمک کن کناں؟",
    'sd-PK': "مهرباني! ڪا ٻي شيءِ آهي جنهن ۾ مان مدد ڪري سگهان ٿي؟",
    'ps-PK': "مننه! بله څه شته چې زه مرسته کولی شم؟",
    'pa-PK': "شکریہ! ہور کوئی گل اے جس وچ میں مدد کر سکدی آں؟",
    ar: "شكراً! هل هناك شيء آخر يمكنني مساعدتك به؟",
    es: "¡Gracias! ¿Hay algo más en lo que pueda ayudarte?",
    'ta-LK': "நன்றி! வேறு ஏதாவது உதவ முடியுமா?"
  },

  // Goodbye
  goodbye: {
    en: "Goodbye! Have a great day. Message me anytime you need help.",
    ur: "خدا حافظ! اچھا دن گزاریں۔ جب بھی ضرورت ہو پیغام بھیجیں۔",
    'bal-PK': "خدا حافظ! روچ شما مبارک بات۔ کدی مدد لوٹ اِت، پیغام بفرستیت۔",
    'sd-PK': "خدا حافظ! سٺو ڏينهن گذاريو۔ جڏهن به ضرورت هجي پيغام ڏيو۔",
    'ps-PK': "په مخه مو ښه! ښه ورځ ولرئ۔ کله چې مرستې ته اړتیا وه، پیغام راولېږئ۔",
    'pa-PK': "خدا حافظ! ودھیا دن گزارو۔ جدوں وی لوڑ ہوے، پیغام بھیجو۔",
    ar: "مع السلامة! أتمنى لك يوماً رائعاً. راسلني في أي وقت تحتاج مساعدة.",
    es: "¡Adiós! Que tengas un excelente día. Escríbeme cuando necesites ayuda.",
    'ta-LK': "போய் வருகிறேன்! நல்ல நாள் அனுபவியுங்கள். உதவி தேவைப்படும்போது எப்போதும் செய்தி அனுப்புங்கள்."
  }
};

/**
 * Get system message in specified language
 * @param {string} messageKey - Message key (e.g., 'freshStart')
 * @param {string} language - Language code
 * @returns {string} Localized message
 */
function getSystemMessage(messageKey, language) {
  const messages = SYSTEM_MESSAGES[messageKey];

  if (!messages) {
    console.error(`Unknown message key: ${messageKey}`);
    return '';
  }

  // Return message in requested language, fall back to English
  return messages[language] || messages['en'];
}

/**
 * Get all available message keys
 * @returns {string[]}
 */
function getMessageKeys() {
  return Object.keys(SYSTEM_MESSAGES);
}

/**
 * Check if a message key exists
 * @param {string} key - Message key
 * @returns {boolean}
 */
function hasMessage(key) {
  return key in SYSTEM_MESSAGES;
}

/**
 * Get all supported languages for system messages
 * @returns {string[]}
 */
function getSupportedLanguages() {
  return ['en', 'ur', 'ar', 'es', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK', 'ta-LK'];
}

module.exports = {
  SYSTEM_MESSAGES,
  getSystemMessage,
  getMessageKeys,
  hasMessage,
  getSupportedLanguages
};
