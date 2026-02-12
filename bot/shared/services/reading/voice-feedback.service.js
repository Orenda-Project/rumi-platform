/**
 * Voice Feedback Service for Reading Assessments
 * Generates encouraging voice feedback for teachers/students
 *
 * Features:
 * - GPT-4 generated personalized feedback script
 * - Phonetic pronunciation guidance for errors
 * - Language-appropriate TTS (ElevenLabs for en/es/ar, Uplift for ur)
 * - Handles language mixing (English words in Urdu feedback)
 * - Warm, encouraging, teacher-friendly tone
 *
 * Language Rules:
 * - Use user's preferred language from database
 * - Urdu feedback: Keep English words in English (e.g., "لفظ cat کو...")
 * - Phonetic guidance: Use natural descriptions (not SSML, since eleven_v3 doesn't support phoneme tags)
 *
 * Phonetic Approach:
 * - Spell out sounds naturally: "/k/ /æ/ /t/" or "kuh-ah-tuh"
 * - Provide rhyming examples: "rhymes with 'mat'"
 * - Use respelling: "said is pronounced like sed"
 */

const fs = require('fs');
const path = require('path');
const { getClient } = require('../llm-client');
const AudioService = require('../audio.service');
const FluencyService = require('./fluency.service');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY, TEMP_DIR } = require('../../utils/constants');

const openai = getClient();

class VoiceFeedbackService {
  /**
   * Generate voice feedback for reading assessment
   * @param {object} assessment - Assessment record with all analysis data
   * @param {string} teacherName - Teacher's name (from users table)
   * @param {string} userLanguage - User's preferred language (from database)
   * @returns {Promise<Buffer>} Audio buffer (MP3)
   */
  static async generateVoiceFeedback(assessment, teacherName, userLanguage = 'en') {
    try {
      // Bug #17 Fix: Extract student name from assessment
      const studentName = assessment.student_identifier || 'the student';

      logToFile('📢 Starting voice feedback generation', {
        assessmentId: assessment.id,
        teacherName,
        studentName,
        language: userLanguage,
        wcpm: assessment.wcpm,
        accuracy: assessment.accuracy_percentage
      });

      // Step 1: Generate feedback script with GPT-4
      const script = await this.generateFeedbackScript(assessment, teacherName, studentName, userLanguage);

      logToFile('✅ Feedback script generated', {
        assessmentId: assessment.id,
        scriptLength: script.length,
        language: userLanguage
      });

      // Step 2: Convert script to speech using appropriate TTS
      const audioBuffer = await AudioService.generateSpeechForLanguage(script, userLanguage);

      logToFile('✅ Voice feedback audio generated', {
        assessmentId: assessment.id,
        audioSize: audioBuffer.length,
        language: userLanguage
      });

      return audioBuffer;

    } catch (error) {
      logToFile('❌ Error generating voice feedback', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate personalized feedback script using GPT-4
   * @param {object} assessment - Assessment record
   * @param {string} teacherName - Teacher's name (from users table)
   * @param {string} studentName - Student's name (from assessment.student_identifier)
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<string>} Feedback script for TTS
   */
  static async generateFeedbackScript(assessment, teacherName, studentName, userLanguage) {
    try {
      // Build context from assessment data
      const gradeLevel = this._getGradeLabel(assessment.grade_level);
      const wcpm = Math.round(assessment.wcpm * 10) / 10;
      const accuracy = Math.round(assessment.accuracy_percentage);
      const benchmarkMin = assessment.grade_benchmark_min;
      const benchmarkMax = assessment.grade_benchmark_max;
      const onTrack = assessment.on_track;
      const language = assessment.language === 'ur' ? 'Urdu' : 'English';

      // Sprint 1.8: Check if comprehension assessment was completed
      const hasComprehension = assessment.comprehension_score !== null && assessment.comprehension_score !== undefined;
      let comprehensionContext = '';

      if (hasComprehension) {
        const compScore = Math.round(assessment.comprehension_score);
        const compCorrect = assessment.comprehension_analysis?.correctAnswers || 0;
        const compTotal = assessment.comprehension_analysis?.totalQuestions || 5;
        const compBenchmark = assessment.comprehension_analysis?.benchmarkStatus?.label || 'Unknown';

        // Analyze which question types were struggled with
        const answers = assessment.comprehension_analysis?.answers || [];
        const literalWrong = answers.filter(a => a.questionType === 'literal' && !a.correct).length;
        const inferentialWrong = answers.filter(a => a.questionType === 'inferential' && !a.correct).length;
        const vocabularyWrong = answers.filter(a => a.questionType === 'vocabulary' && !a.correct).length;

        comprehensionContext = `
**Comprehension Results**:
- Score: ${compCorrect}/${compTotal} (${compScore}%)
- Benchmark: ${compBenchmark}
- Literal questions wrong: ${literalWrong}/2
- Inferential questions wrong: ${inferentialWrong}/2
- Vocabulary questions wrong: ${vocabularyWrong}/1`;

        logToFile('Including comprehension context in voice feedback', {
          assessmentId: assessment.id,
          compScore,
          compBenchmark,
          literalWrong,
          inferentialWrong,
          vocabularyWrong
        });
      }

      // CRITICAL: Use Azure pronunciation errors for English, word alignment for Urdu
      let topErrors;
      let errorSource;
      let totalErrorCount;

      if (assessment.pronunciation_data?.source === 'azure' && assessment.pronunciation_data.words) {
        // Bug #17 Fix: Expand to top 3-4 errors (from 2)
        // Bug #32 Fix: Pass transcript and passage text for word-level comparison
        const azureErrors = this._extractAzureErrors(
          assessment.pronunciation_data.words,
          assessment.transcript_text,
          assessment.passage_text
        );
        topErrors = azureErrors.slice(0, 4); // Top 3-4 errors (prioritized by severity)
        errorSource = 'azure';
        totalErrorCount = azureErrors.length;

        logToFile('Using Azure pronunciation errors for voice feedback with word-level comparison', {
          azureErrorCount: azureErrors.length,
          topErrorsCount: topErrors.length,
          hasTranscript: !!assessment.transcript_text,
          hasPassage: !!assessment.passage_text
        });
      } else {
        // Fallback to word alignment errors for Urdu
        const errors = assessment.errors || [];
        topErrors = errors.slice(0, 4); // Top 3-4 errors (from 2)
        errorSource = 'word_alignment';
        totalErrorCount = errors.length;

        logToFile('Using word alignment errors for voice feedback (Azure not available)', {
          errorCount: errors.length,
          topErrorsCount: topErrors.length
        });
      }

      // Build phonetic examples for mispronounced words
      const phoneticExamples = this._buildPhoneticExamples(topErrors, assessment.language);

      // Generate language-specific prompts (different for error vs no-error cases)
      let prompts;

      if (topErrors.length === 0) {
        // NO ERRORS - Fluency-focused prompts (prevent hallucination)
        prompts = {
          en: `You are Rumi, a warm reading coach providing audio feedback to ${teacherName} ABOUT their student ${studentName}.

**IMPORTANT**: You are speaking TO ${teacherName} (the teacher) ABOUT ${studentName} (the student). Never address the student directly!

**Great News**: ${studentName} read with ${accuracy}% accuracy - excellent pronunciation! NO word-level errors detected.

**Area for Growth**: WCPM is ${wcpm}, ${onTrack ? 'which is on track' : `below benchmark ${benchmarkMin}-${benchmarkMax}`}.
${!onTrack ? 'This suggests reading fluency (speed/smoothness) needs work, NOT pronunciation.' : 'This is good progress - fluency is developing well!'}
${comprehensionContext}

Generate a MAXIMUM 60-second voice script (150-180 words):
1. Greet ${teacherName} warmly, mention this is ${studentName}'s reading assessment (e.g., "Hello ${teacherName}, this is the reading assessment for ${studentName}")
2. Celebrate the excellent ${accuracy}% accuracy - no pronunciation errors!
3. Explain WCPM ${wcpm} vs benchmark ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `4. Mention comprehension score and which question types need practice (literal/inferential/vocabulary)
5. Give 1-2 specific activities for weak question types OR fluency practice` : `4. ${!onTrack ? 'Give 2-3 fluency-building activities (repeated reading, echo reading, timed practice, reading with expression)' : 'Encourage continued practice to maintain fluency'}`}
${hasComprehension ? '6' : '5'}. End with encouragement about building reading confidence

**Critical Constraints**:
- MAXIMUM 60 seconds (150-180 words total)
- DO NOT mention specific word errors - there are NONE!
${hasComprehension ? '- Balance fluency and comprehension guidance' : '- Focus on fluency (speed/smoothness), not pronunciation'}
- Be warm and encouraging
- Use emotion tags: [warmly], [enthusiastically], [proudly]
- Natural speech, conversational tone
- Remember: Speak TO the teacher ABOUT the student (not to the student!)`,

          ur: `آپ رومی ہیں، ${teacherName} کے لیے آڈیو فیڈ بیک فراہم کر رہے ہیں۔

**خوشخبری**: ${studentName} نے ${accuracy}% درستگی سے پڑھا - بہترین تلفظ! کوئی غلطی نہیں ملی۔

**بہتری کی جگہ**: WCPM ${wcpm} ہے، ${onTrack ? 'جو ٹریک پر ہے' : `بینچ مارک ${benchmarkMin}-${benchmarkMax} سے کم ہے`}۔
${!onTrack ? 'یہ بتاتا ہے کہ پڑھنے کی روانی (رفتار/ہمواری) پر کام کی ضرورت ہے، تلفظ پر نہیں۔' : 'یہ اچھی ترقی ہے - روانی اچھی طرح سے ترقی کر رہی ہے!'}
${comprehensionContext}

زیادہ سے زیادہ 60 سیکنڈ کی آواز اسکرپٹ بنائیں (150-180 الفاظ):
1. ${teacherName} کو گرمجوشی سے سلام کریں، ${studentName} کے ریڈنگ اسیسمنٹ کا ذکر کریں (مثلاً "ہیلو ${teacherName}، یہ ${studentName} کا ریڈنگ اسیسمنٹ ہے")
2. بہترین ${accuracy}% درستگی کی تعریف کریں - کوئی تلفظ کی غلطی نہیں!
3. WCPM ${wcpm} بمقابلہ بینچ مارک ${benchmarkMin}-${benchmarkMax} سمجھائیں
${hasComprehension ? `4. فہم کا سکور اور کون سے سوالات کی اقسام کو مشق کی ضرورت ہے (literal/inferential/vocabulary)
5. کمزور سوالات کی اقسام یا روانی کے لیے 1-2 مخصوص سرگرمیاں دیں` : `4. ${!onTrack ? 'روانی بڑھانے کی 2-3 سرگرمیاں دیں (بار بار پڑھنا، گونج کی طرح پڑھنا، وقت کے ساتھ مشق)' : 'روانی برقرار رکھنے کے لیے مسلسل مشق کی حوصلہ افزائی کریں'}`}
${hasComprehension ? '6' : '5'}. پڑھنے کے اعتماد کی تعمیر کے بارے میں حوصلہ افزائی کے ساتھ ختم کریں

**اہم پابندیاں**:
- زیادہ سے زیادہ 60 سیکنڈ (150-180 الفاظ)
- مخصوص الفاظ کی غلطیوں کا ذکر نہ کریں - کوئی نہیں ہے!
${hasComprehension ? '- روانی اور فہم کی رہنمائی میں توازن رکھیں' : '- روانی (رفتار/ہمواری) پر توجہ دیں، تلفظ پر نہیں'}
- NO emotion tags (Uplift AI doesn't support them)
- قدرتی، بات چیت کا انداز`,

          ar: `أنت رومي، تقدم ملاحظات صوتية لـ ${teacherName}.

**أخبار رائعة**: قرأ ${studentName} بدقة ${accuracy}% - نطق ممتاز! لم يتم اكتشاف أخطاء في الكلمات.

**مجال للنمو**: WCPM هو ${wcpm}، ${onTrack ? 'وهو على المسار الصحيح' : `أقل من المعيار ${benchmarkMin}-${benchmarkMax}`}.
${!onTrack ? 'هذا يشير إلى أن الطلاقة في القراءة (السرعة/السلاسة) تحتاج عملاً، وليس النطق.' : 'هذا تقدم جيد - الطلاقة تتطور بشكل جيد!'}
${comprehensionContext}

أنشئ نص صوتي بحد أقصى 60 ثانية (150-180 كلمة):
1. رحب بـ ${teacherName} بحرارة، اذكر أن هذا تقييم القراءة لـ ${studentName} (مثل "مرحباً ${teacherName}، هذا تقييم القراءة لـ ${studentName}")
2. احتفل بالدقة الممتازة ${accuracy}% - لا أخطاء في النطق!
3. اشرح WCPM ${wcpm} مقابل المعيار ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `4. اذكر نقاط الفهم وأنواع الأسئلة التي تحتاج إلى ممارسة (literal/inferential/vocabulary)
5. قدم 1-2 أنشطة محددة لأنواع الأسئلة الضعيفة أو ممارسة الطلاقة` : `4. ${!onTrack ? 'قدم 2-3 أنشطة لبناء الطلاقة (القراءة المتكررة، القراءة بالصدى، الممارسة الموقوتة، القراءة بالتعبير)' : 'شجع على الممارسة المستمرة للحفاظ على الطلاقة'}`}
${hasComprehension ? '6' : '5'}. اختم بتشجيع حول بناء ثقة القراءة

**قيود حرجة**:
- حد أقصى 60 ثانية (150-180 كلمة)
- لا تذكر أخطاء كلمات محددة - لا يوجد أي منها!
${hasComprehension ? '- وازن بين إرشادات الطلاقة والفهم' : '- ركز على الطلاقة (السرعة/السلاسة)، وليس النطق'}
- استخدم علامات العاطفة: [warmly]، [enthusiastically]، [proudly]
- كلام طبيعي، نبرة محادثة`,

          es: `Eres Rumi, proporcionando retroalimentación en audio a ${teacherName}.

**¡Excelentes noticias!**: ${studentName} leyó con ${accuracy}% de precisión - ¡pronunciación excelente! NO se detectaron errores de palabras.

**Área de crecimiento**: WCPM es ${wcpm}, ${onTrack ? 'que está en buen camino' : `por debajo de la referencia ${benchmarkMin}-${benchmarkMax}`}.
${!onTrack ? 'Esto sugiere que la fluidez de lectura (velocidad/suavidad) necesita trabajo, NO la pronunciación.' : '¡Este es un buen progreso - la fluidez se está desarrollando bien!'}
${comprehensionContext}

Genera un guion de voz de MÁXIMO 60 segundos (150-180 palabras):
1. Saluda a ${teacherName} calurosamente, menciona que esta es la evaluación de lectura de ${studentName} (ej. "Hola ${teacherName}, esta es la evaluación de lectura de ${studentName}")
2. Celebra la excelente precisión del ${accuracy}% - ¡sin errores de pronunciación!
3. Explica WCPM ${wcpm} vs referencia ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `4. Menciona la puntuación de comprensión y qué tipos de preguntas necesitan práctica (literal/inferential/vocabulary)
5. Da 1-2 actividades específicas para tipos de preguntas débiles O práctica de fluidez` : `4. ${!onTrack ? 'Da 2-3 actividades para desarrollar fluidez (lectura repetida, lectura eco, práctica cronometrada, lectura con expresión)' : 'Anima a continuar la práctica para mantener la fluidez'}`}
${hasComprehension ? '6' : '5'}. Termina con aliento sobre construir confianza en la lectura

**Restricciones críticas**:
- MÁXIMO 60 segundos (150-180 palabras)
- NO menciones errores de palabras específicas - ¡NO hay ninguno!
${hasComprehension ? '- Equilibra la orientación de fluidez y comprensión' : '- Enfócate en fluidez (velocidad/suavidad), no pronunciación'}
- Usa etiquetas de emoción: [warmly], [enthusiastically], [proudly]
- Habla natural, tono conversacional`
        };
      } else {
        // HAS ERRORS - Error-focused prompts (original logic)
        prompts = {
          en: `You are Rumi, a warm reading coach providing audio feedback to ${teacherName} ABOUT their student ${studentName}.

**IMPORTANT**: You are speaking TO ${teacherName} (the teacher) ABOUT ${studentName} (the student). Never address the student directly!

**Performance**: ${studentName}'s WCPM ${wcpm} (benchmark: ${benchmarkMin}-${benchmarkMax}), Accuracy ${accuracy}%, ${onTrack ? 'On track' : 'Needs support'}

**Top Errors** (prioritized by severity):
${topErrors.map(e => this._formatErrorForPrompt(e, errorSource)).join('\n')}

${phoneticExamples}
${comprehensionContext}

Generate a MAXIMUM 60-second voice script (150-180 words):
1. Greet ${teacherName} warmly, mention this is ${studentName}'s reading assessment (e.g., "Hello ${teacherName}, this is the reading assessment for ${studentName}")
2. State WCPM ${wcpm} and accuracy ${accuracy}%, compare to benchmark ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `3. Briefly mention comprehension score (${Math.round(assessment.comprehension_score || 0)}%)
4. For top 2-3 pronunciation errors: Describe what ${studentName} said vs correct pronunciation (brief!)
5. Give 1 specific activity for pronunciation AND 1 for weak comprehension question types` : `3. For top 3-4 errors ONLY (if that many exist): Describe what ${studentName} said vs what it should be, then explain correct pronunciation using phonetic breakdown (e.g., "${studentName} said 'MAN-ee', but 'many' should be pronounced 'MEN-ee' with sounds /m/ /ɛ/ /n/ /i/")
4. Give 1-2 specific practice activities for these error patterns`}
${hasComprehension ? '6' : '5'}. End with brief encouragement

**Critical Constraints**:
- MAXIMUM 60 seconds (150-180 words total)
${hasComprehension ? '- Balance pronunciation errors and comprehension guidance - keep each section brief!' : '- Focus on top 3-4 errors (or fewer if less than 4 exist)'}
- For each error, include what student ACTUALLY said vs correct pronunciation
- Be concise with each error - brief explanation only
- Use emotion tags: [warmly], [enthusiastically], [thoughtfully]
- Natural speech, conversational tone
- Remember: Speak TO the teacher ABOUT the student (not to the student!)`,

          ur: `آپ رومی ہیں، ${teacherName} کے لیے آڈیو فیڈ بیک فراہم کر رہے ہیں۔

**کارکردگی**: ${studentName} کا WCPM ${wcpm} (بینچ مارک: ${benchmarkMin}-${benchmarkMax}), درستگی ${accuracy}%, ${onTrack ? 'ٹریک پر' : 'مدد چاہیے'}

**اہم غلطیاں** (شدت کے لحاظ سے):
${topErrors.map(e => this._formatErrorForPrompt(e, errorSource)).join('\n')}

${phoneticExamples}
${comprehensionContext}

زیادہ سے زیادہ 60 سیکنڈ کی آواز اسکرپٹ بنائیں (150-180 الفاظ):
1. ${teacherName} کو گرمجوشی سے سلام کریں، ${studentName} کے ریڈنگ اسیسمنٹ کا ذکر کریں (مثلاً "ہیلو ${teacherName}، یہ ${studentName} کا ریڈنگ اسیسمنٹ ہے")
2. WCPM ${wcpm} اور درستگی ${accuracy}% بتائیں، بینچ مارک ${benchmarkMin}-${benchmarkMax} سے موازنہ کریں
${hasComprehension ? `3. مختصراً فہم کا سکور بتائیں (${Math.round(assessment.comprehension_score || 0)}%)
4. صرف 2-3 اہم تلفظ کی غلطیوں کے لیے: ${studentName} نے کیا کہا بمقابلہ صحیح (مختصر!)
5. تلفظ کے لیے 1 سرگرمی اور کمزور فہم کی اقسام کے لیے 1 سرگرمی دیں` : `3. صرف 3-4 اہم غلطیوں کے لیے (اگر اتنی موجود ہیں): ${studentName} نے کیا کہا بمقابلہ صحیح، پھر صوتی تفصیل (مثلاً "${studentName} نے 'MAN-ee' کہا، لیکن 'many' کو 'MEN-ee' کہنا چاہیے")
4. ان غلطیوں کے لیے 1-2 مخصوص مشق کی سرگرمیاں دیں`}
${hasComprehension ? '6' : '5'}. مختصر حوصلہ افزائی کے ساتھ ختم کریں

**اہم پابندیاں**:
- زیادہ سے زیادہ 60 سیکنڈ (150-180 الفاظ)
${hasComprehension ? '- تلفظ کی غلطیوں اور فہم کی رہنمائی میں توازن - ہر حصہ مختصر رکھیں!' : '- 3-4 اہم غلطیوں پر توجہ دیں (یا کم اگر 4 سے کم ہیں)'}
- ہر غلطی کے لیے، طالب علم نے کیا کہا بمقابلہ صحیح تلفظ
- ہر غلطی کے ساتھ مختصر رہیں - صرف مختصر وضاحت
- NO emotion tags (Uplift AI doesn't support them)
- CRITICAL: Keep ALL English words in ASCII letters (e.g., "school" NOT "سکول", "reading" NOT "ریڈنگ") - Uplift TTS requires ASCII for English pronunciation
- قدرتی، بات چیت کا انداز`,

          ar: `أنت رومي، تقدم ملاحظات صوتية لـ ${teacherName}.

**الأداء**: WCPM ${studentName} هو ${wcpm} (معيار: ${benchmarkMin}-${benchmarkMax})، دقة ${accuracy}%، ${onTrack ? 'على المسار' : 'يحتاج دعم'}

**أهم الأخطاء** (حسب الشدة):
${topErrors.map(e => this._formatErrorForPrompt(e, errorSource)).join('\n')}

${phoneticExamples}
${comprehensionContext}

أنشئ نص صوتي بحد أقصى 60 ثانية (150-180 كلمة):
1. رحب بـ ${teacherName} بحرارة، اذكر أن هذا تقييم القراءة لـ ${studentName} (مثل "مرحباً ${teacherName}، هذا تقييم القراءة لـ ${studentName}")
2. اذكر WCPM ${wcpm} ودقة ${accuracy}%، قارن بالمعيار ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `3. اذكر باختصار درجة الفهم (${Math.round(assessment.comprehension_score || 0)}%)
4. لأفضل 2-3 أخطاء النطق: وصف ما قال ${studentName} مقابل النطق الصحيح (موجز!)
5. أعط نشاط واحد محدد للنطق وواحد لأنواع أسئلة الفهم الضعيفة` : `3. لأفضل 3-4 أخطاء فقط (إذا كانت موجودة): وصف ما قال ${studentName} مقابل الصحيح، ثم اشرح النطق الصحيح بالتفصيل الصوتي (مثل "قال ${studentName} 'MAN-ee'، لكن 'many' يجب أن يُنطق 'MEN-ee'")
4. أعط 1-2 نشاط ممارسة محدد لهذه الأنماط الخطأ`}
${hasComprehension ? '6' : '5'}. اختم بتشجيع موجز

**قيود حرجة**:
- حد أقصى 60 ثانية (150-180 كلمة)
${hasComprehension ? '- وازن بين أخطاء النطق وإرشادات الفهم - اجعل كل قسم موجز!' : '- ركز على أفضل 3-4 أخطاء (أو أقل إذا كان أقل من 4)'}
- لكل خطأ، قم بتضمين ما قاله الطالب فعلياً مقابل النطق الصحيح
- كن موجزاً مع كل خطأ - شرح موجز فقط
- استخدم علامات العاطفة: [warmly]، [enthusiastically]، [thoughtfully]
- كلام طبيعي، نبرة محادثة`,

          es: `Eres Rumi, proporcionando retroalimentación en audio a ${teacherName}.

**Rendimiento**: WCPM de ${studentName} es ${wcpm} (referencia: ${benchmarkMin}-${benchmarkMax}), Precisión ${accuracy}%, ${onTrack ? 'En camino' : 'Necesita apoyo'}

**Errores principales** (priorizados por severidad):
${topErrors.map(e => this._formatErrorForPrompt(e, errorSource)).join('\n')}

${phoneticExamples}
${comprehensionContext}

Genera un guion de voz de MÁXIMO 60 segundos (150-180 palabras):
1. Saluda a ${teacherName} calurosamente, menciona que esta es la evaluación de lectura de ${studentName} (ej. "Hola ${teacherName}, esta es la evaluación de lectura de ${studentName}")
2. Indica WCPM ${wcpm} y precisión ${accuracy}%, compara con referencia ${benchmarkMin}-${benchmarkMax}
${hasComprehension ? `3. Menciona brevemente la puntuación de comprensión (${Math.round(assessment.comprehension_score || 0)}%)
4. Para los 2-3 errores principales de pronunciación: Describe lo que dijo ${studentName} vs pronunciación correcta (¡breve!)
5. Da 1 actividad específica para pronunciación Y 1 para tipos de preguntas de comprensión débiles` : `3. Para los 3-4 errores principales SOLAMENTE (si existen tantos): Describe lo que dijo ${studentName} vs lo correcto, luego explica la pronunciación correcta con desglose fonético (ej. "${studentName} dijo 'MAN-ee', pero 'many' debe pronunciarse 'MEN-ee'")
4. Da 1-2 actividades de práctica específicas para estos patrones de error`}
${hasComprehension ? '6' : '5'}. Termina con aliento breve

**Restricciones críticas**:
- MÁXIMO 60 segundos (150-180 palabras)
${hasComprehension ? '- ¡Equilibra errores de pronunciación y orientación de comprensión - mantén cada sección breve!' : '- Enfócate en los 3-4 errores principales (o menos si hay menos de 4)'}
- Para cada error, incluye lo que el estudiante REALMENTE dijo vs pronunciación correcta
- Sé conciso con cada error - solo explicación breve
- Usa etiquetas de emoción: [warmly], [enthusiastically], [thoughtfully]
- Habla natural, tono conversacional`
        };
      }

      const prompt = prompts[userLanguage] || prompts.en;

      logToFile('Generating feedback script with GPT-4', {
        assessmentId: assessment.id,
        language: userLanguage,
        totalErrorCount: totalErrorCount,
        topErrorsCount: topErrors.length,
        errorSource: errorSource
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are Rumi, a warm and encouraging reading coach. Generate concise, natural voice feedback scripts. MAXIMUM 60 seconds (150-180 words).

**CRITICAL - Addressing Rules**:
- You are speaking TO the teacher (${teacherName})
- ABOUT the student (${studentName})
- NEVER address the student directly
- Use "you/your" to refer to the TEACHER only
- Use "${studentName}" or "the student" or "he/she/they" to refer to the STUDENT
- Example CORRECT: "Hello ${teacherName}, ${studentName}'s performance shows..."
- Example WRONG: "Hello ${teacherName}, YOUR performance shows..." (This makes it sound like the teacher took the test!)
- Think of this as a report TO the teacher ABOUT their student`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500 // Enough for 150-180 words (reduced from 800 to enforce 60s limit)
      });

      const script = response.choices[0].message.content.trim();

      logToFile('✅ Feedback script generated by GPT-4', {
        assessmentId: assessment.id,
        scriptLength: script.length,
        wordCount: script.split(/\s+/).length
      });

      return script;

    } catch (error) {
      logToFile('❌ Error generating feedback script', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Extract and prioritize pronunciation errors from Azure data
   * Bug #17 Enhancement: Extract actual vs expected pronunciation
   * Bug #32 Fix: Use transcript/passage word-level comparison for actual pronunciation
   * @param {Array} words - Words array from Azure pronunciation assessment
   * @param {string} transcriptText - Actual transcribed text from Soniox (optional, for context)
   * @param {string} passageText - Reference passage text (optional, for context)
   * @returns {Array} Prioritized errors
   * @private
   */
  static _extractAzureErrors(words, transcriptText = null, passageText = null) {
    if (!words || words.length === 0) {
      return [];
    }

    // Error priority: Mispronunciation > UnexpectedBreak > MissingBreak > Monotone
    const errorPriority = {
      'Mispronunciation': 1,
      'UnexpectedBreak': 2,
      'MissingBreak': 3,
      'Monotone': 4
    };

    // Prepare word-level comparison arrays if texts provided
    let transcriptWords = [];
    let passageWords = [];
    if (transcriptText && passageText) {
      // CRITICAL FIX: Clean transcript to remove timestamps and speaker labels
      // This fixes Bug #35 where "[00:09] Teacher (EN):" was breaking word alignment
      // Bug #24 Fix: Use correct method name - cleanTranscriptForAlignment, not cleanTranscript
      const cleanedTranscript = FluencyService.cleanTranscriptForAlignment(transcriptText);
      transcriptWords = cleanedTranscript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      passageWords = passageText.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    }

    // Filter words with errors (errorType !== 'None')
    const errors = words
      .filter(w => w.errorType && w.errorType !== 'None')
      .map((w, index) => {
        // Bug #32 Fix: Find actual vs expected using word position
        let actualPronunciation = null;
        let expectedPronunciation = w.word; // Expected is always the reference word

        if (w.errorType === 'Mispronunciation' && transcriptWords.length > 0 && passageWords.length > 0) {
          // Find the word position in passage
          const wordLower = w.word.toLowerCase();
          const passageIndex = passageWords.indexOf(wordLower);

          if (passageIndex >= 0 && passageIndex < transcriptWords.length) {
            // Get corresponding word from transcript at same position
            actualPronunciation = transcriptWords[passageIndex];

            // Log detailed comparison
            logToFile('Word-level mispronunciation match', {
              expected: wordLower,
              actual: actualPronunciation,
              position: passageIndex,
              match: actualPronunciation === wordLower
            });
          }
        }

        return {
          word: w.word,
          errorType: w.errorType,
          accuracyScore: Math.round(w.accuracyScore || 0),
          phonemes: w.phonemes || [],
          syllables: w.syllables || [],
          // Bug #32: Use word-level comparison instead of phoneme extraction
          actualPronunciation: actualPronunciation,
          expectedPronunciation: expectedPronunciation
        };
      })
      .filter(error => {
        // CRITICAL VALIDATION: Filter out invalid error pairs
        // This prevents nonsensical feedback like "said ',' instead of 'word'"

        // Skip if no actual pronunciation found
        if (!error.actualPronunciation) {
          logToFile('⚠️ Skipping error: no actual pronunciation', {
            expected: error.expectedPronunciation,
            errorType: error.errorType
          });
          return false;
        }

        const actual = error.actualPronunciation.trim();
        const expected = error.expectedPronunciation.toLowerCase().trim();

        // Skip if actual matches expected (no error)
        if (actual === expected) {
          logToFile('⚠️ Skipping error: actual matches expected', {
            word: actual
          });
          return false;
        }

        // Skip if actual is punctuation only
        if (/^[.,!?;:()\[\]{}'"]+$/.test(actual)) {
          logToFile('⚠️ Skipping error: punctuation only', {
            actual: actual,
            expected: expected
          });
          return false;
        }

        // Skip if actual contains speaker labels or parentheses
        if (/\(.*\)|Teacher|Student|EN|UR|AR|ES/i.test(actual)) {
          logToFile('⚠️ Skipping error: contains speaker label', {
            actual: actual,
            expected: expected
          });
          return false;
        }

        // Skip if actual is too short (< 2 chars) unless it's a valid single-letter word
        const validSingleLetterWords = ['a', 'i'];
        if (actual.length < 2 && !validSingleLetterWords.includes(actual.toLowerCase())) {
          logToFile('⚠️ Skipping error: too short and not a valid word', {
            actual: actual,
            expected: expected
          });
          return false;
        }

        // Skip if actual contains mostly numbers or special characters
        if (/^[0-9\W]+$/.test(actual)) {
          logToFile('⚠️ Skipping error: numbers or special characters', {
            actual: actual,
            expected: expected
          });
          return false;
        }

        // Valid error pair
        return true;
      });

    // Sort by error priority, then by accuracy score (lowest first)
    errors.sort((a, b) => {
      const priorityDiff = (errorPriority[a.errorType] || 999) - (errorPriority[b.errorType] || 999);
      if (priorityDiff !== 0) return priorityDiff;
      return a.accuracyScore - b.accuracyScore; // Lowest accuracy first
    });

    logToFile('Extracted Azure pronunciation errors with word-level comparison', {
      totalWords: words.length,
      errorCount: errors.length,
      transcriptProvided: !!transcriptText,
      passageProvided: !!passageText,
      topErrors: errors.slice(0, 4).map(e =>
        `${e.word} (${e.errorType}, ${e.accuracyScore}%) - Student said: ${e.actualPronunciation || 'N/A'}`
      )
    });

    return errors;
  }

  /**
   * Extract actual pronunciation from Azure phoneme data
   * @param {object} wordData - Word data from Azure
   * @returns {string} Phonetic representation of actual pronunciation
   * @private
   */
  static _extractActualPronunciation(wordData) {
    // If Azure provides actualPronunciation field directly
    if (wordData.actualPronunciation) {
      return wordData.actualPronunciation;
    }

    // Otherwise, build from phonemes with low accuracy scores
    if (wordData.phonemes && wordData.phonemes.length > 0) {
      // Join phonemes that were mispronounced (low accuracy)
      const mispronounced = wordData.phonemes
        .filter(p => p.accuracyScore < 60) // Threshold for mispronunciation
        .map(p => p.Phoneme || p.phoneme)
        .join('');

      if (mispronounced) {
        return mispronounced;
      }
    }

    return null;
  }

  /**
   * Extract expected pronunciation from Azure phoneme data
   * @param {object} wordData - Word data from Azure
   * @returns {string} Phonetic representation of expected pronunciation
   * @private
   */
  static _extractExpectedPronunciation(wordData) {
    // If Azure provides expectedPronunciation field directly
    if (wordData.expectedPronunciation) {
      return wordData.expectedPronunciation;
    }

    // Otherwise, build from all phonemes
    if (wordData.phonemes && wordData.phonemes.length > 0) {
      return wordData.phonemes
        .map(p => p.Phoneme || p.phoneme)
        .join('');
    }

    return null;
  }

  /**
   * Build phonetic examples for mispronounced words
   * @param {Array} errors - Top errors
   * @param {string} language - Assessment language
   * @returns {string} Formatted phonetic examples
   * @private
   */
  static _buildPhoneticExamples(errors, language) {
    if (!errors || errors.length === 0) {
      return 'No specific mispronunciations to address.';
    }

    const examples = [];

    for (const error of errors) {
      // Azure error structure (has errorType)
      if (error.errorType && error.errorType === 'Mispronunciation') {
        const word = error.word;
        const phonemes = error.phonemes || [];
        const syllables = error.syllables || [];

        if (language === 'en') {
          if (phonemes.length > 0) {
            // Use actual phoneme data from Azure
            const phonemeList = phonemes.map(p => p.Phoneme).join(' ');
            examples.push(`Word: "${word}" - Phonemes: ${phonemeList} (accuracy: ${error.accuracyScore}%)`);
          } else {
            examples.push(`Word: "${word}" - Provide natural phonetic guidance (accuracy: ${error.accuracyScore}%)`);
          }
        } else {
          examples.push(`Word: "${word}" - Describe the correct pronunciation naturally`);
        }
      }
      // Word alignment error structure (has type)
      else if (error.type === 'substitution' && error.expected) {
        const word = error.expected;

        // For English, provide IPA-style phonetic breakdown
        if (language === 'en') {
          examples.push(`Word: "${word}" - Provide natural phonetic guidance like "/m/ /æ/ /t/" for "mat" or "rhymes with cat"`);
        } else {
          // For Urdu, focus on sound description in natural language
          examples.push(`Word: "${word}" - Describe the correct pronunciation naturally`);
        }
      }
    }

    return examples.length > 0
      ? examples.join('\n')
      : 'Focus on general fluency improvements.';
  }

  /**
   * Format error for GPT-4 prompt
   * Bug #17 Enhancement: Include actual vs expected pronunciation
   * @param {object} error - Error object
   * @param {string} errorSource - Source of error data ('azure' or 'word_alignment')
   * @returns {string} Formatted error description
   * @private
   */
  static _formatErrorForPrompt(error, errorSource = 'word_alignment') {
    // Azure pronunciation errors have different structure
    if (errorSource === 'azure') {
      if (error.errorType === 'Mispronunciation') {
        // Bug #17: Include actual vs expected pronunciation if available
        let description = `- Mispronounced: "${error.word}" (accuracy: ${error.accuracyScore}%)`;
        if (error.actualPronunciation && error.expectedPronunciation) {
          description += ` - Student said: "${error.actualPronunciation}", Expected: "${error.expectedPronunciation}"`;
        }
        return description;
      } else if (error.errorType === 'UnexpectedBreak') {
        return `- Unexpected pause at: "${error.word}"`;
      } else if (error.errorType === 'MissingBreak') {
        return `- Missing pause after: "${error.word}"`;
      } else if (error.errorType === 'Monotone') {
        return `- Monotone reading at: "${error.word}"`;
      }
      return `- Error in: "${error.word}"`;
    }

    // Word alignment errors
    if (error.type === 'omission') {
      return `- Omitted: "${error.word}"`;
    } else if (error.type === 'insertion') {
      return `- Inserted extra word: "${error.word}"`;
    } else if (error.type === 'substitution') {
      return `- Said "${error.actual}" instead of "${error.expected}"`;
    }
    return '- Unknown error';
  }

  /**
   * Get grade label
   * @param {number} gradeLevel - Grade level
   * @returns {string} Human-readable grade label
   * @private
   */
  static _getGradeLabel(gradeLevel) {
    const labels = {
      0: 'Early Years',
      1: 'Grade 1',
      2: 'Grade 2',
      3: 'Grade 3'
    };
    return labels[gradeLevel] || `Grade ${gradeLevel}`;
  }

  /**
   * Upload voice feedback to R2
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {string} userId - User UUID
   * @param {string} assessmentId - Assessment UUID
   * @returns {Promise<string>} Public URL
   */
  static async uploadVoiceFeedback(audioBuffer, userId, assessmentId) {
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

      const r2Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });

      const BUCKET_NAME = process.env.R2_BUCKET_NAME;
      const key = `reading_voice_feedback/${userId}/${assessmentId}.mp3`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
        Metadata: {
          userId: userId,
          assessmentId: assessmentId,
          generatedAt: new Date().toISOString()
        }
      });

      await r2Client.send(command);

      const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

      logToFile('✅ Voice feedback uploaded to R2', { key, url: publicUrl });

      return publicUrl;

    } catch (error) {
      logToFile('❌ Error uploading voice feedback to R2', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = VoiceFeedbackService;
