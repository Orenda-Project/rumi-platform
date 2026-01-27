/**
 * Rumi Capabilities Configuration
 *
 * ⚠️ IMPORTANT: When adding new features to the bot, update this file!
 *
 * This config powers the capability detection system that helps users
 * understand what the bot can do.
 */

module.exports = {
  // Core capabilities list (update this when adding features!)
  capabilities: [
    {
      id: 'lesson_plans',
      name: {
        en: 'Lesson Plan Generation',
        ur: 'لیسن پلانز',
        ar: 'خطط الدروس',
        es: 'Planes de Lección'
      },
      description: {
        en: 'Comprehensive, evidence-based lesson plans (9-section structure) in PDF format',
        ur: 'مکمل، شواہد پر مبنی لیسن پلانز (9 حصوں کی ساخت) PDF فارمیٹ میں',
        ar: 'خطط دروس شاملة قائمة على الأدلة (هيكل من 9 أقسام) بصيغة PDF',
        es: 'Planes de lección completos basados en evidencia (estructura de 9 secciones) en formato PDF'
      },
      howToUse: {
        en: 'Just describe your lesson topic and grade level',
        ur: 'بس اپنے لیسن کا موضوع اور گریڈ لیول بتائیں',
        ar: 'فقط صف موضوع الدرس ومستوى الصف',
        es: 'Solo describe el tema de tu lección y el nivel de grado'
      },
      keywords: ['lesson plan', 'plan', 'teaching plan', 'لیسن پلان', 'منصوبة', 'خطة درس']
    },
    {
      id: 'presentations',
      name: {
        en: 'Presentation Creation',
        ur: 'پریزنٹیشنز',
        ar: 'العروض التقديمية',
        es: 'Presentaciones'
      },
      description: {
        en: 'Visual presentations on any educational topic',
        ur: 'کسی بھی تعلیمی موضوع پر بصری پریزنٹیشنز',
        ar: 'عروض تقديمية مرئية حول أي موضوع تعليمي',
        es: 'Presentaciones visuales sobre cualquier tema educativo'
      },
      howToUse: {
        en: 'Request a presentation on your desired topic',
        ur: 'اپنے مطلوبہ موضوع پر پریزنٹیشن کی درخواست کریں',
        ar: 'اطلب عرضاً تقديمياً حول الموضوع المطلوب',
        es: 'Solicita una presentación sobre el tema deseado'
      },
      keywords: ['presentation', 'slides', 'powerpoint', 'پریزنٹیشن', 'سلائیڈز', 'عرض تقديمي']
    },
    {
      id: 'coaching',
      name: {
        en: 'Classroom Coaching',
        ur: 'کلاس روم کوچنگ',
        ar: 'التدريب الصفي',
        es: 'Coaching en el Aula'
      },
      description: {
        en: 'Observation feedback based on video/audio recordings, with reflective conversation',
        ur: 'ویڈیو/آڈیو ریکارڈنگز پر مبنی مشاہدے کی رائے، غور و فکر کی گفتگو کے ساتھ',
        ar: 'ملاحظات بناءً على تسجيلات الفيديو/الصوت، مع محادثة تأملية',
        es: 'Retroalimentación de observación basada en grabaciones de video/audio, con conversación reflexiva'
      },
      howToUse: {
        en: 'Upload your classroom video or audio, plus lesson plan',
        ur: 'اپنی کلاس روم ویڈیو یا آڈیو، نیز لیسن پلان اپ لوڈ کریں',
        ar: 'قم بتحميل فيديو أو صوت الفصل الدراسي، بالإضافة إلى خطة الدرس',
        es: 'Sube tu video o audio del aula, más el plan de lección'
      },
      keywords: ['coaching', 'coach', 'observation', 'feedback', 'کوچنگ', 'مشاہدہ', 'تدريب', 'ملاحظات']
    },
    {
      id: 'voice_support',
      name: {
        en: 'Voice Messages',
        ur: 'صوتی پیغامات',
        ar: 'الرسائل الصوتية',
        es: 'Mensajes de Voz'
      },
      description: {
        en: 'Send and receive voice messages in Urdu, English, Arabic, and Spanish',
        ur: 'اردو، انگریزی، عربی اور ہسپانوی میں صوتی پیغامات بھیجیں اور وصول کریں',
        ar: 'إرسال واستقبال الرسائل الصوتية بالأردية والإنجليزية والعربية والإسبانية',
        es: 'Envía y recibe mensajes de voz en urdu, inglés, árabe y español'
      },
      howToUse: {
        en: 'Just record and send a voice message!',
        ur: 'بس ایک صوتی پیغام ریکارڈ کریں اور بھیجیں!',
        ar: 'فقط سجّل وأرسل رسالة صوتية!',
        es: '¡Solo graba y envía un mensaje de voz!'
      },
      keywords: ['voice', 'audio', 'speak', 'talk', 'آواز', 'بولیں', 'صوت', 'تحدث', 'voz', 'hablar']
    },
    {
      id: 'text_support',
      name: {
        en: 'Text Messages',
        ur: 'تحریری پیغامات',
        ar: 'الرسائل النصية',
        es: 'Mensajes de Texto'
      },
      description: {
        en: 'Full text-based interaction in multiple languages',
        ur: 'متعدد زبانوں میں مکمل تحریری تعامل',
        ar: 'تفاعل نصي كامل بلغات متعددة',
        es: 'Interacción completa basada en texto en varios idiomas'
      },
      howToUse: {
        en: 'Type your message and I\'ll respond',
        ur: 'اپنا پیغام ٹائپ کریں اور میں جواب دوں گی',
        ar: 'اكتب رسالتك وسأجيب',
        es: 'Escribe tu mensaje y responderé'
      },
      keywords: ['text', 'message', 'type', 'write', 'متن', 'ٹائپ', 'لکھیں', 'نص', 'اكتب', 'texto', 'escribir']
    },
    {
      id: 'ai_video_generation',
      name: {
        en: 'AI Video Generation',
        ur: 'AI ویڈیو بنانا',
        ar: 'إنشاء فيديو بالذكاء الاصطناعي',
        es: 'Generación de Video con IA'
      },
      description: {
        en: 'Create custom educational videos on any topic in any of 9 languages',
        ur: 'کسی بھی موضوع پر 9 زبانوں میں مخصوص تعلیمی ویڈیوز بنائیں',
        ar: 'إنشاء مقاطع فيديو تعليمية مخصصة حول أي موضوع بأي من 9 لغات',
        es: 'Crea videos educativos personalizados sobre cualquier tema en 9 idiomas'
      },
      howToUse: {
        en: 'Type /video or say "make a video about [topic]"',
        ur: '/video ٹائپ کریں یا کہیں "ویڈیو بنائیں [موضوع] کے بارے میں"',
        ar: 'اكتب /video أو قل "اصنع فيديو عن [الموضوع]"',
        es: 'Escribe /video o di "haz un video sobre [tema]"'
      },
      keywords: ['video', 'generate', 'create video', 'make video', 'ویڈیو', 'بنانا', 'فيديو', 'إنشاء', 'crear', 'generar']
    },
    {
      id: 'reading_assessment',
      name: {
        en: 'Reading Assessment',
        ur: 'ریڈنگ ٹیسٹ',
        ar: 'تقييم القراءة',
        es: 'Evaluación de Lectura'
      },
      description: {
        en: 'Test student reading fluency, pronunciation, and comprehension with detailed reports',
        ur: 'طلباء کی پڑھنے کی روانی، تلفظ اور فہم کی جانچ کریں تفصیلی رپورٹس کے ساتھ',
        ar: 'اختبار طلاقة قراءة الطلاب والنطق والفهم مع تقارير مفصلة',
        es: 'Evalúa la fluidez lectora, pronunciación y comprensión de los estudiantes con informes detallados'
      },
      howToUse: {
        en: 'Type /reading test to start a reading assessment',
        ur: '/reading test ٹائپ کریں',
        ar: 'اكتب /reading test لبدء التقييم',
        es: 'Escribe /reading test para iniciar'
      },
      keywords: ['reading', 'fluency', 'pronunciation', 'wcpm', 'assessment', 'ریڈنگ', 'پڑھنا', 'تلفظ', 'قراءة', 'lectura']
    }

    // ⚠️ ADD NEW CAPABILITIES HERE WHEN FEATURES ARE ADDED!
    // Follow the same structure:
    // {
    //   id: 'unique_id',
    //   name: { en, ur, ar, es },
    //   description: { en, ur, ar, es },
    //   howToUse: { en, ur, ar, es },
    //   keywords: [...]
    // }
  ],

  // Detection keywords for capability questions
  detectionKeywords: {
    en: ['can you', 'do you', 'are you able', 'how do i', 'help me', 'what can', 'support'],
    ur: ['کیا آپ', 'کیسے', 'مدد', 'کیا کر سکتے', 'سپورٹ'],
    ar: ['هل يمكنك', 'كيف', 'مساعدة', 'هل تدعم', 'ماذا يمكنك'],
    es: ['puedes', 'cómo', 'ayuda', 'puedes hacer', 'apoyas']
  }
};
