/**
 * Reading Assessment Analysis Service
 * Orchestrates the complete analysis pipeline for reading assessments
 *
 * Analysis Pipeline:
 * 1. Transcribe audio with Soniox (speaker diarization enabled)
 * 2. Extract student audio segments (filter teacher encouragement)
 * 3. Run pronunciation assessment:
 *    - English: Azure Pronunciation Assessment (phoneme-level)
 *    - Urdu/Other: GPT-4o audio analysis (word-level)
 * 4. Calculate fluency metrics (WCPM, accuracy, errors)
 * 5. Compare to grade-level benchmarks (L2-adjusted for Urdu)
 * 6. Generate diagnostic summary with GPT-4
 * 7. Generate PDF report
 * 8. Generate voice feedback (optional)
 * 9. Send results to teacher
 *
 * ARCHITECTURE NOTE:
 * - For MVP: Runs synchronously (3-5 minute processing time)
 * - For Scale: Can be moved to SQS worker with Redis locks
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const FeatureLinkerService = require('../feature-linker.service');
const FeatureRegistrationService = require('../feature-registration.service');
const { logToFile } = require('../../utils/logger');
const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../../utils/constants');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

class AnalysisService {
  /**
   * Queue analysis job (MVP: runs synchronously, can be moved to SQS later)
   * @param {string} assessmentId - UUID of reading assessment
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language for messages
   * @returns {Promise<void>}
   */
  static async queueAnalysis(assessmentId, userId, phoneNumber, userLanguage = 'en') {
    try {
      logToFile('📊 Queueing reading assessment analysis', {
        assessmentId,
        userId
      });

      // For MVP: Run analysis directly (synchronously)
      // For production: Queue to SQS with Redis locks
      await this.runAnalysis(assessmentId, userId, phoneNumber, userLanguage);

    } catch (error) {
      logToFile('❌ Error queueing analysis', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Run complete analysis pipeline
   * @param {string} assessmentId - UUID of reading assessment
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language for messages
   * @returns {Promise<void>}
   */
  static async runAnalysis(assessmentId, userId, phoneNumber, userLanguage = 'en') {
    try {
      logToFile('🔬 Starting reading assessment analysis', { assessmentId });

      // Update status to processing
      await supabase
        .from('reading_assessments')
        .update({
          status: 'processing',
          processing_started_at: new Date().toISOString()
        })
        .eq('id', assessmentId);

      // Get assessment data (let allows reassignment after fluency metrics update)
      let { data: assessment, error: fetchError } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (fetchError || !assessment) {
        throw new Error('Assessment not found');
      }

      logToFile('Assessment data retrieved', {
        assessmentId,
        language: assessment.language,
        gradeLevel: assessment.grade_level,
        audioUrl: assessment.audio_url
      });

      // STEP 1: Transcribe audio with speaker diarization
      logToFile('Step 1/7: Transcribing audio with Soniox...');
      const transcriptionResult = await this.transcribeAudio(assessment);

      // Update assessment with transcription
      await supabase
        .from('reading_assessments')
        .update({
          transcript_text: transcriptionResult.text,
          transcript_confidence: transcriptionResult.confidence,
          word_timestamps: transcriptionResult.wordTimestamps,
          num_speakers_detected: transcriptionResult.numSpeakers,
          detected_language: transcriptionResult.language,
          audio_duration_seconds: transcriptionResult.audioDurationSeconds, // Bug #29 fix: Store calculated duration
          last_successful_step: 'transcription'
        })
        .eq('id', assessmentId);

      logToFile('✅ Transcription complete', { assessmentId });

      // STEP 2: Run pronunciation assessment
      logToFile('Step 2/7: Running pronunciation assessment...');
      const pronunciationResult = await this.assessPronunciation(assessment, transcriptionResult);

      // Update assessment with pronunciation data
      await supabase
        .from('reading_assessments')
        .update({
          pronunciation_data: pronunciationResult.pronunciationData,
          prosody_analysis: pronunciationResult.prosodyAnalysis,
          audio_quality_score: pronunciationResult.qualityScore,
          last_successful_step: 'pronunciation'
        })
        .eq('id', assessmentId);

      logToFile('✅ Pronunciation assessment complete', { assessmentId });

      // STEP 3: Calculate fluency metrics
      logToFile('Step 3/7: Calculating fluency metrics...');
      const fluencyMetrics = await this.calculateFluencyMetrics(
        assessment,
        transcriptionResult,
        pronunciationResult
      );

      // DIAGNOSTIC: Log exact values being passed to database
      logToFile('🔍 DIAGNOSTIC: Fluency metrics before database UPDATE', {
        assessmentId,
        selfCorrectionsCount: fluencyMetrics.selfCorrectionsCount,
        selfCorrectionsCountType: typeof fluencyMetrics.selfCorrectionsCount,
        selfCorrectionsCountIsArray: Array.isArray(fluencyMetrics.selfCorrectionsCount),
        selfCorrectionsArray: fluencyMetrics.selfCorrections,
        selfCorrectionsArrayLength: fluencyMetrics.selfCorrections?.length
      });

      // Update assessment with fluency metrics
      const { error: fluencyUpdateError } = await supabase
        .from('reading_assessments')
        .update({
          total_words_in_passage: fluencyMetrics.totalWords,
          words_read: fluencyMetrics.wordsRead,
          words_correct: fluencyMetrics.wordsCorrect,
          wcpm: fluencyMetrics.wcpm,
          accuracy_percentage: fluencyMetrics.wordAccuracy, // Bug #15 fix: word alignment accuracy
          pronunciation_accuracy: fluencyMetrics.pronunciationAccuracy, // Bug #15 fix: Azure pronunciation accuracy
          time_elapsed_seconds: fluencyMetrics.timeElapsed,
          errors: fluencyMetrics.errors,
          self_corrections_count: fluencyMetrics.selfCorrectionsCount, // Fixed: use count (integer), not array
          last_successful_step: 'fluency_metrics'
        })
        .eq('id', assessmentId);

      if (fluencyUpdateError) {
        logToFile('❌ Failed to save fluency metrics', {
          assessmentId,
          error: fluencyUpdateError.message
        });
        throw fluencyUpdateError;
      }

      // CRITICAL: Refetch assessment with updated fluency metrics
      const { data: updatedAssessment, error: refetchError } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (refetchError || !updatedAssessment) {
        logToFile('❌ Failed to refetch assessment after fluency update', {
          assessmentId,
          error: refetchError?.message
        });
        throw refetchError || new Error('Assessment not found after update');
      }

      // Replace stale assessment object with fresh data
      assessment = updatedAssessment;

      logToFile('✅ Fluency metrics calculated and saved', {
        assessmentId,
        wcpm: assessment.wcpm,
        accuracy: assessment.accuracy_percentage
      });

      // STEP 4: Compare to benchmarks
      // Bug #3e Fix: Pass passage_type to use correct benchmark function (LCPM for letters, WCPM for others)
      logToFile('Step 4/7: Comparing to grade-level benchmarks...');
      const benchmarkResult = await this.compareToBenchmarks(
        fluencyMetrics.wcpm,
        assessment.grade_level,
        assessment.language,
        assessment.is_second_language,
        assessment.passage_type
      );

      // Update assessment with benchmark comparison
      await supabase
        .from('reading_assessments')
        .update({
          grade_benchmark_min: benchmarkResult.benchmarkMin,
          grade_benchmark_max: benchmarkResult.benchmarkMax,
          percentile_rank: benchmarkResult.percentileRank,
          on_track: benchmarkResult.onTrack,
          last_successful_step: 'benchmark_comparison'
        })
        .eq('id', assessmentId);

      logToFile('✅ Benchmark comparison complete', { assessmentId });

      // STEP 5: Generate diagnostic summary
      logToFile('Step 5/7: Generating diagnostic summary...');
      const diagnosticSummary = await this.generateDiagnosticSummary(
        assessment,
        fluencyMetrics,
        pronunciationResult,
        benchmarkResult,
        userLanguage
      );

      // Update assessment with diagnostic summary
      await supabase
        .from('reading_assessments')
        .update({
          diagnostic_summary: diagnosticSummary,
          last_successful_step: 'diagnostic_summary'
        })
        .eq('id', assessmentId);

      logToFile('✅ Diagnostic summary generated', { assessmentId });

      // CRITICAL: Refetch assessment with ALL updates before proceeding
      // The assessment object was fetched at the start but benchmarks and diagnostic_summary
      // were added later via database updates. We need fresh data.
      const { data: finalAssessment, error: finalRefetchError } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (finalRefetchError || !finalAssessment) {
        logToFile('❌ Failed to refetch assessment', {
          assessmentId,
          error: finalRefetchError?.message
        });
        throw finalRefetchError || new Error('Assessment not found');
      }

      logToFile('✅ Assessment refetched with all updates', {
        assessmentId,
        hasBenchmarks: !!(finalAssessment.grade_benchmark_min && finalAssessment.grade_benchmark_max),
        hasDiagnosticSummary: !!finalAssessment.diagnostic_summary,
        comprehensionRequested: finalAssessment.comprehension_requested
      });

      // Use fresh assessment
      assessment = finalAssessment;

      // Sprint 1.8: Check if comprehension testing is requested
      // CRITICAL FIX: Check BEFORE generating report to avoid duplicate reports
      // Bug #3 Fix: Block comprehension for 'letters' type (pedagogically invalid - random letters have no meaning)
      const comprehensionAllowed = assessment.comprehension_requested && assessment.passage_type !== 'letters';

      if (assessment.comprehension_requested && assessment.passage_type === 'letters') {
        logToFile('⚠️ Comprehension blocked for letters type (pedagogically invalid)', {
          assessmentId,
          passage_type: assessment.passage_type
        });
      }

      if (comprehensionAllowed) {
        logToFile('📚 Comprehension requested - deferring report generation until after comprehension', { assessmentId });

        try {
          // Start comprehension flow (generates questions and sends first one)
          // NO REPORT GENERATED YET!
          await this.startComprehensionFlow(assessment, phoneNumber, userLanguage);

          // Update status to fluency_completed (not fully completed yet)
          await supabase
            .from('reading_assessments')
            .update({
              status: 'fluency_completed',
              last_successful_step: 'fluency_analysis_completed'
            })
            .eq('id', assessmentId);

          logToFile('✅ Fluency analysis complete, comprehension questions started (report deferred)', { assessmentId });
        } catch (comprehensionError) {
          logToFile('⚠️ Error starting comprehension flow, falling back to fluency-only report', {
            assessmentId,
            error: comprehensionError.message
          });

          // Fall back to fluency-only report
          await this.generateAndSendFluencyReport(assessment, phoneNumber, userLanguage);
        }
      } else {
        // No comprehension requested - generate fluency-only report NOW
        logToFile('📊 No comprehension requested - generating fluency-only report', { assessmentId });

        await this.generateAndSendFluencyReport(assessment, phoneNumber, userLanguage);
      }

    } catch (error) {
      logToFile('❌ Error in analysis pipeline', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });

      // Update assessment with error
      await supabase
        .from('reading_assessments')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', assessmentId);

      // Send error message to teacher
      const errorPrompt = `Generate a brief error message in language code "${userLanguage}" saying:
1. There was an error analyzing the reading assessment
2. Our team has been notified
3. They can try again or contact support
4. Apologetic tone
5. Maximum 3 sentences
6. NO markdown`;

      const errorResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: errorPrompt }],
        temperature: 0.3,
        max_tokens: 150
      });

      await WhatsAppService.sendMessage(
        phoneNumber,
        errorResponse.choices[0].message.content.trim()
      );

      throw error;
    }
  }

  /**
   * Generate and send fluency-only report (no comprehension)
   * Called when: 1) No comprehension requested, 2) Comprehension flow error fallback
   * @param {object} assessment - Complete assessment record with all fluency data
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<void>}
   */
  static async generateAndSendFluencyReport(assessment, phoneNumber, userLanguage) {
    try {
      logToFile('📊 Generating fluency-only report', { assessmentId: assessment.id });

      // STEP 6: Generate PDF report
      logToFile('Step 6/8: Generating PDF report...');

      const reportUrl = await this.generateReport(assessment, userLanguage);

      // Update assessment with report URL
      await supabase
        .from('reading_assessments')
        .update({
          report_pdf_url: reportUrl,
          report_generated_at: new Date().toISOString(),
          last_successful_step: 'report_generation',
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', assessment.id);

      logToFile('✅ PDF report generated', { assessmentId: assessment.id, reportUrl });

      // STEP 7: Send results to teacher
      logToFile('Step 7/8: Sending results to teacher...');
      await this.sendResults(assessment, reportUrl, phoneNumber, userLanguage);

      // STEP 8 (OPTIONAL): Generate voice feedback
      logToFile('Step 8/8: Generating voice feedback (optional)...');
      try {
        const voiceFeedbackUrl = await this.generateVoiceFeedback(assessment, userLanguage);

        // Bug #1 Fix: Add defensive logging to understand voice feedback delivery failures
        logToFile('🔍 Voice feedback generation result', {
          assessmentId: assessment.id,
          voiceFeedbackUrl: voiceFeedbackUrl || 'NULL/UNDEFINED',
          urlType: typeof voiceFeedbackUrl,
          hasUrl: !!voiceFeedbackUrl
        });

        if (voiceFeedbackUrl) {
          // Update assessment with voice feedback URL
          await supabase
            .from('reading_assessments')
            .update({
              voice_feedback_url: voiceFeedbackUrl
            })
            .eq('id', assessment.id);

          // Send voice feedback to teacher
          logToFile('📤 Attempting to send voice feedback to teacher', {
            assessmentId: assessment.id,
            phoneNumber,
            voiceFeedbackUrl
          });

          await WhatsAppService.sendAudioFromUrl(phoneNumber, voiceFeedbackUrl);
          logToFile('✅ Voice feedback sent to teacher', { assessmentId: assessment.id });
        } else {
          // Bug #1 Fix: Log when voiceFeedbackUrl is null/falsy
          logToFile('⚠️ Voice feedback URL is null/falsy - skipping delivery', {
            assessmentId: assessment.id,
            voiceFeedbackUrl
          });
        }
      } catch (voiceError) {
        // Voice feedback is optional - don't fail entire assessment if it errors
        logToFile('⚠️ Voice feedback generation failed (non-critical)', {
          assessmentId: assessment.id,
          error: voiceError.message,
          stack: voiceError.stack
        });
      }

      logToFile('✅ Fluency-only report generation complete', { assessmentId: assessment.id });

      // Suggest next feature after reading assessment completion
      try {
        await FeatureLinkerService.suggestNext(
          'reading',
          assessment.user_id,
          phoneNumber,
          userLanguage,
          { assessmentId: assessment.id }
        );
      } catch (linkerError) {
        logToFile('⚠️ Error in feature linker after reading', { error: linkerError.message });
      }

      // Check and trigger registration if needed (non-blocking)
      try {
        await FeatureRegistrationService.checkAndTriggerRegistration(
          assessment.user_id,
          'reading',
          phoneNumber,
          userLanguage,
          'voice' // Reading assessments use voice
        );
      } catch (regError) {
        logToFile('Registration trigger error (non-fatal)', { error: regError.message });
      }

    } catch (error) {
      logToFile('❌ Error generating fluency report', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * STEP 1: Transcribe audio with Soniox (speaker diarization)
   * @param {object} assessment - Assessment record
   * @returns {Promise<object>} { text, confidence, wordTimestamps, numSpeakers, language }
   */
  static async transcribeAudio(assessment) {
    try {
      const TranscriptionService = require('./transcription.service');

      const transcriptionResult = await TranscriptionService.transcribeReading(
        assessment.id,
        assessment.audio_url,
        assessment.language
      );

      logToFile('✅ Reading transcription complete', {
        assessmentId: assessment.id,
        wordCount: transcriptionResult.wordCount,
        numSpeakers: transcriptionResult.numSpeakers,
        qualityScore: transcriptionResult.qualityScore,
        audioDurationSeconds: transcriptionResult.audioDurationSeconds
      });

      return {
        text: transcriptionResult.text,
        confidence: transcriptionResult.confidence,
        wordTimestamps: transcriptionResult.wordTimestamps,
        numSpeakers: transcriptionResult.numSpeakers,
        language: transcriptionResult.detectedLanguage,
        qualityScore: transcriptionResult.qualityScore,
        speakerStats: transcriptionResult.speakerStats,
        languageMismatch: transcriptionResult.languageMismatch,
        fullText: transcriptionResult.fullText,
        audioDurationSeconds: transcriptionResult.audioDurationSeconds // Bug #29 fix
      };

    } catch (error) {
      logToFile('❌ Error in transcribeAudio', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * STEP 2: Assess pronunciation
   * - English: Azure Pronunciation Assessment
   * - Other: GPT-4o audio analysis
   * @param {object} assessment - Assessment record
   * @param {object} transcriptionResult - Transcription result from Step 1
   * @returns {Promise<object>} { pronunciationData, prosodyAnalysis, qualityScore }
   */
  static async assessPronunciation(assessment, transcriptionResult) {
    try {
      const PronunciationService = require('./pronunciation.service');

      const pronunciationResult = await PronunciationService.assessPronunciation(
        assessment.id,
        assessment.audio_url,
        assessment.passage_text,
        assessment.language,
        transcriptionResult.text
      );

      logToFile('✅ Pronunciation assessment complete', {
        assessmentId: assessment.id,
        source: pronunciationResult.source,
        model: pronunciationResult.model,
        pronunciationScore: pronunciationResult.pronunciationScore,
        accuracyScore: pronunciationResult.accuracyScore,
        fluencyScore: pronunciationResult.fluencyScore
      });

      return {
        pronunciationData: pronunciationResult,
        prosodyAnalysis: pronunciationResult.prosodyAnalysis,
        qualityScore: pronunciationResult.pronunciationScore / 100 // Normalize to 0-1
      };

    } catch (error) {
      logToFile('❌ Error in assessPronunciation', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * STEP 3: Calculate fluency metrics
   * @param {object} assessment - Assessment record
   * @param {object} transcriptionResult - Transcription result
   * @param {object} pronunciationResult - Pronunciation result
   * @returns {Promise<object>} Fluency metrics
   */
  static async calculateFluencyMetrics(assessment, transcriptionResult, pronunciationResult) {
    try {
      const FluencyService = require('./fluency.service');

      const fluencyMetrics = await FluencyService.calculateFluencyMetrics(
        assessment,
        transcriptionResult,
        pronunciationResult
      );

      logToFile('✅ Fluency metrics calculated', {
        assessmentId: assessment.id,
        wcpm: fluencyMetrics.wcpm,
        wordAccuracy: fluencyMetrics.wordAccuracy,
        pronunciationAccuracy: fluencyMetrics.pronunciationAccuracy || 'N/A',
        correctWords: fluencyMetrics.wordsCorrect,
        totalWords: fluencyMetrics.totalWords
      });

      return fluencyMetrics;

    } catch (error) {
      logToFile('❌ Error in calculateFluencyMetrics', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * STEP 4: Compare to grade-level benchmarks
   * @param {number} wcpm - Words/Letters Correct Per Minute
   * @param {number} gradeLevel - Grade level (0-3)
   * @param {string} language - 'en' or 'ur'
   * @param {boolean} isSecondLanguage - L2 learner flag
   * @param {string} passageType - 'letters', 'words', 'sentences', 'paragraph', etc.
   * @returns {Promise<object>} Benchmark comparison
   */
  static async compareToBenchmarks(wcpm, gradeLevel, language, isSecondLanguage, passageType = 'sentences') {
    let data, error;

    // Bug #3e Fix: Use LCPM benchmarks for letters, WCPM benchmarks for everything else
    if (passageType === 'letters') {
      // Letters use LCPM (Letters Correct Per Minute) benchmarks
      const result = await supabase.rpc('check_lcpm_benchmark_status', {
        p_lcpm: wcpm,
        p_grade: gradeLevel,
        p_language: language
      });
      data = result.data;
      error = result.error;

      logToFile('📊 Using LCPM benchmarks for letters assessment', {
        lcpm: wcpm,
        gradeLevel,
        language
      });
    } else {
      // Words/Sentences/Paragraphs use WCPM (Words Correct Per Minute) benchmarks
      const result = await supabase.rpc('check_benchmark_status', {
        p_wcpm: wcpm,
        p_grade: gradeLevel,
        p_language: language,
        p_is_l2: isSecondLanguage
      });
      data = result.data;
      error = result.error;
    }

    if (error) {
      logToFile('❌ Error calling benchmark function', { error, passageType });
      throw error;
    }

    const result = data[0];

    return {
      benchmarkMin: result.benchmark_min,
      benchmarkMax: result.benchmark_max,
      onTrack: result.on_track,
      percentileRank: result.percentile_rank
    };
  }

  /**
   * STEP 5: Generate diagnostic summary using GPT-4
   * @param {object} assessment - Assessment record
   * @param {object} fluencyMetrics - Fluency metrics
   * @param {object} pronunciationResult - Pronunciation result
   * @param {object} benchmarkResult - Benchmark comparison
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<string>} Diagnostic summary
   */
  static async generateDiagnosticSummary(
    assessment,
    fluencyMetrics,
    pronunciationResult,
    benchmarkResult,
    userLanguage
  ) {
    const prompt = `Generate a diagnostic summary for a grade ${assessment.grade_level} student's reading assessment in language code "${userLanguage}".

Assessment Data:
- Language: ${assessment.language}
- WCPM: ${fluencyMetrics.wcpm}
- Word Accuracy: ${fluencyMetrics.wordAccuracy}%
- Pronunciation Accuracy: ${fluencyMetrics.pronunciationAccuracy ? fluencyMetrics.pronunciationAccuracy + '%' : 'N/A (Urdu assessment)'}
- Benchmark: ${benchmarkResult.benchmarkMin}-${benchmarkResult.benchmarkMax} WCPM
- On Track: ${benchmarkResult.onTrack ? 'Yes' : 'No'}
- Percentile: ${benchmarkResult.percentileRank}

Generate a 3-4 sentence summary that:
1. States the student's current reading level
2. Compares to grade-level expectations
3. Highlights 1-2 key strengths
4. Suggests 1-2 specific next steps for improvement
5. Uses encouraging, supportive language
6. NO markdown formatting`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 300
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * STEP 6: Generate PDF report
   * @param {object} assessment - Assessment record
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<string>} Report PDF URL
   */
  static async generateReport(assessment, userLanguage) {
    try {
      const ReadingReportService = require('./report.service');

      // Get user data for teacher name
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', assessment.user_id)
        .single();

      const teacherName = user ? `${user.first_name} ${user.last_name}`.trim() : 'Unknown';

      // Build report data
      const reportData = {
        studentIdentifier: assessment.student_identifier || 'Student',
        teacherName: teacherName,
        assessmentDate: new Date(assessment.created_at).toLocaleDateString(),
        language: assessment.language,
        gradeLevel: assessment.grade_level,
        passageType: assessment.passage_type,
        passageText: assessment.passage_text,
        wcpm: assessment.wcpm,
        accuracy: assessment.accuracy_percentage,
        timeElapsed: assessment.time_elapsed_seconds,
        wordsCorrect: assessment.words_correct,
        totalWords: assessment.total_words_in_passage,
        benchmark: {
          benchmarkMin: assessment.grade_benchmark_min,
          benchmarkMax: assessment.grade_benchmark_max,
          onTrack: assessment.on_track,
          percentileRank: assessment.percentile_rank
        },
        errors: assessment.errors || [],
        pronunciation: assessment.pronunciation_data ? {
          pronunciationData: assessment.pronunciation_data
        } : null,
        diagnosticSummary: assessment.diagnostic_summary || 'Analysis in progress...'
      };

      // BUG #34 FIX: Add comprehension data if available
      if (assessment.comprehension_answers && assessment.comprehension_score !== null) {
        const answers = assessment.comprehension_answers;
        const correctAnswers = answers.filter(a => a.correct).length;
        const totalQuestions = answers.length;
        const score = assessment.comprehension_score;

        // Determine benchmark status based on score
        let benchmarkStatus;
        if (score >= 80) {
          benchmarkStatus = {
            label: 'Excellent Comprehension',
            color: '#10B981',
            description: 'Student demonstrates strong understanding of the passage'
          };
        } else if (score >= 60) {
          benchmarkStatus = {
            label: 'Good Comprehension',
            color: '#F59E0B',
            description: 'Student shows adequate understanding with room for improvement'
          };
        } else {
          benchmarkStatus = {
            label: 'Needs Support',
            color: '#EF4444',
            description: 'Student requires additional support with reading comprehension'
          };
        }

        // ALWAYS translate student answers to English for proper PDF rendering
        // (PDFKit has rendering issues with non-English text, especially Urdu/Arabic)
        const translatedAnswers = await Promise.all(
          answers.map(async (answer) => {
            let translatedStudentAnswer = answer.studentAnswer || '';
            const originalAnswer = translatedStudentAnswer;

            // ALWAYS translate if language is not English
            // or if answer contains non-Latin characters (Urdu/Arabic)
            const hasNonLatin = /[\u0600-\u06FF]/.test(translatedStudentAnswer);
            const needsTranslation = assessment.language !== 'en' || hasNonLatin;

            if (needsTranslation && translatedStudentAnswer) {
              try {
                const languageName = assessment.language === 'ur' ? 'Urdu' :
                                    assessment.language === 'ar' ? 'Arabic' :
                                    assessment.language === 'es' ? 'Spanish' : 'this language';
                const translatePrompt = `Translate this ${languageName} text to English. Just provide the translation, no explanations:\n\n${translatedStudentAnswer}`;
                const translateResponse = await openai.chat.completions.create({
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: translatePrompt }],
                  temperature: 0.3,
                  max_tokens: 100
                });
                translatedStudentAnswer = translateResponse.choices[0].message.content.trim();

                logToFile('✓ Answer translated', {
                  from: assessment.language,
                  original: originalAnswer.substring(0, 50),
                  translated: translatedStudentAnswer.substring(0, 50)
                });
              } catch (error) {
                logToFile('⚠️ Translation error for comprehension answer', {
                  error: error.message,
                  original: translatedStudentAnswer
                });
                // Fallback: use original if translation fails
              }
            }

            return {
              ...answer,
              studentAnswer: translatedStudentAnswer,
              originalAnswer: originalAnswer // Keep original for reference
            };
          })
        );

        reportData.comprehension = {
          answers: translatedAnswers,
          correctAnswers: correctAnswers,
          totalQuestions: totalQuestions,
          score: score,
          benchmarkStatus: benchmarkStatus
        };

        logToFile('✓ Comprehension data added to report (answers translated)', {
          assessmentId: assessment.id,
          score: score,
          correctAnswers: correctAnswers,
          totalQuestions: totalQuestions
        });

        // Enhance diagnostic summary to include comprehension commentary
        const enhancedSummaryPrompt = `Enhance this reading assessment diagnostic summary to include comprehension performance.

Original Summary (fluency-focused):
${reportData.diagnosticSummary}

Comprehension Data:
- Score: ${score}% (${correctAnswers}/${totalQuestions} correct)
- Performance: ${benchmarkStatus.label}

Generate an enhanced 4-5 sentence summary that:
1. Keeps the fluency commentary from the original (WCPM, accuracy, etc.)
2. Adds 1-2 sentences about comprehension performance
3. Integrates both fluency and comprehension into holistic next steps
4. Uses encouraging, supportive language
5. NO markdown formatting

Output the complete enhanced summary (not just the new parts).`;

        try {
          const enhancedResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: enhancedSummaryPrompt }],
            temperature: 0.5,
            max_tokens: 400
          });

          reportData.diagnosticSummary = enhancedResponse.choices[0].message.content.trim();

          logToFile('✓ Diagnostic summary enhanced with comprehension', {
            assessmentId: assessment.id
          });
        } catch (error) {
          logToFile('⚠️ Failed to enhance diagnostic summary, using original', {
            error: error.message
          });
          // Keep original summary if enhancement fails
        }
      }

      // Generate PDF
      const pdfBuffer = await ReadingReportService.generateReadingAssessmentReport(reportData);

      logToFile('PDF report generated', {
        assessmentId: assessment.id,
        sizeKB: Math.round(pdfBuffer.length / 1024)
      });

      // Upload PDF to R2
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

      // BUG #33 FIX: Use format "Reading Assessment_Student Name_DDMMYYYY.pdf"
      const date = new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dateStr = `${day}${month}${year}`;
      const studentName = assessment.student_identifier || 'Student';
      // Fixed naming convention: Fluency_Only or Fluency_Comprehension
      const reportType = assessment.comprehension_score !== null && assessment.comprehension_score !== undefined ?
        'Fluency_Comprehension' : 'Fluency_Only';
      const fileName = `${reportType}_${studentName}_${dateStr}.pdf`;
      const key = `reading_reports/${assessment.user_id}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          userId: assessment.user_id,
          assessmentId: assessment.id,
          generatedAt: new Date().toISOString()
        }
      });

      await r2Client.send(command);

      const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

      logToFile('✅ Report PDF uploaded to R2', { key, url: publicUrl });

      return publicUrl;

    } catch (error) {
      logToFile('❌ Error generating PDF report', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * STEP 7.5: Generate voice feedback (optional)
   * @param {object} assessment - Assessment record (must be fetched fresh from DB)
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<string|null>} Voice feedback URL or null if failed
   */
  static async generateVoiceFeedback(assessment, userLanguage) {
    try {
      const VoiceFeedbackService = require('./voice-feedback.service');

      // Fetch fresh assessment data with all analysis results
      const { data: freshAssessment } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessment.id)
        .single();

      if (!freshAssessment) {
        throw new Error('Assessment not found');
      }

      // Fetch teacher's name from users table
      const { data: teacher } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', freshAssessment.user_id)
        .single();

      if (!teacher) {
        throw new Error('Teacher not found');
      }

      const teacherName = teacher.first_name || 'Teacher';

      // BUG #1 FIX: Use assessment's language field for voice feedback
      // assessment.language is the actual language of the passage (e.g., 'ur' for Urdu)
      // userLanguage is the user's preferred language (could be 'en' even for Urdu tests)
      const feedbackLanguage = freshAssessment.language || userLanguage;

      logToFile('Generating voice feedback for teacher', {
        assessmentId: assessment.id,
        teacherName,
        assessmentLanguage: freshAssessment.language,
        userPreferredLanguage: userLanguage,
        feedbackLanguage: feedbackLanguage,
        bugFix: 'Bug #1 - Using assessment language instead of user preference'
      });

      // Generate voice feedback audio using assessment language
      const audioBuffer = await VoiceFeedbackService.generateVoiceFeedback(
        freshAssessment,
        teacherName,
        feedbackLanguage
      );

      // Upload to R2
      const voiceFeedbackUrl = await VoiceFeedbackService.uploadVoiceFeedback(
        audioBuffer,
        freshAssessment.user_id,
        freshAssessment.id
      );

      logToFile('✅ Voice feedback generated', {
        assessmentId: assessment.id,
        url: voiceFeedbackUrl,
        size: audioBuffer.length
      });

      return voiceFeedbackUrl;

    } catch (error) {
      logToFile('❌ Error generating voice feedback', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      // Return null instead of throwing - voice feedback is optional
      return null;
    }
  }

  /**
   * STEP 7: Send results to teacher
   * @param {object} assessment - Assessment record
   * @param {string} reportUrl - Report PDF URL
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<void>}
   */
  static async sendResults(assessment, reportUrl, phoneNumber, userLanguage) {
    try {
      // Bug #2 Fix: Fetch teacher's name to address them properly (prevents [Recipient's Name] placeholder)
      const { data: teacher } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', assessment.user_id)
        .single();

      const teacherName = teacher?.first_name || 'Teacher';

      // Send completion message
      // Bug #2 Fix: Include teacher name in prompt so GPT addresses them properly
      const completionPrompt = `Generate a brief message in language code "${userLanguage}" addressing ${teacherName} and saying:
1. The reading assessment for ${assessment.student_identifier} is complete
2. Results show WCPM: ${assessment.wcpm}, Accuracy: ${assessment.accuracy_percentage}%
3. See the detailed report for insights and recommendations
4. Address the teacher by their name (${teacherName}) at the start
5. Use encouraging, professional tone
6. Maximum 3-4 sentences
7. NO markdown, NO placeholders like [Recipient's Name]`;

      const completionResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: completionPrompt }],
        temperature: 0.4,
        max_tokens: 200
      });

      const completionMessage = completionResponse.choices[0].message.content.trim();

      await WhatsAppService.sendMessage(phoneNumber, completionMessage);

      // Send report PDF
      logToFile('📄 Sending PDF report to teacher', {
        assessmentId: assessment.id,
        reportUrl
      });

      await WhatsAppService.sendDocumentFromUrl(phoneNumber, reportUrl, 'Reading_Assessment_Report.pdf');

      logToFile('✅ Results and PDF sent to teacher', {
        assessmentId: assessment.id,
        phoneNumber
      });

    } catch (error) {
      logToFile('❌ Error sending results', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Sprint 1.8: Start comprehension assessment flow
   * Generates questions and sends first question to user
   * @param {object} assessment - Assessment record
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<void>}
   */
  static async startComprehensionFlow(assessment, phoneNumber, userLanguage) {
    try {
      logToFile('📚 Starting comprehension flow', {
        assessmentId: assessment.id,
        language: assessment.language,
        gradeLevel: assessment.grade_level
      });

      // Import ComprehensionService
      const ComprehensionService = require('./comprehension.service');

      // Bug #7: Generate questions based on passage type
      const questionData = await ComprehensionService.generateQuestions(
        assessment.passage_text,
        assessment.language,
        assessment.grade_level,
        assessment.passage_type || 'sentences'  // Bug #7: Pass passage type for dispatch
      );

      // Bug #7: Handle null return (letters passages have no comprehension)
      if (!questionData) {
        logToFile('⏭️ No comprehension for this passage type', {
          assessmentId: assessment.id,
          passageType: assessment.passage_type
        });
        // Skip to report generation for letters
        return;
      }

      const questions = questionData.questions;
      const totalPoints = questionData.total_points || questions.length;

      logToFile('Questions generated for comprehension', {
        assessmentId: assessment.id,
        questionCount: questions.length,
        totalPoints,
        passageType: assessment.passage_type,
        assessmentType: questionData.assessmentType || 'standard'
      });

      // Send introduction message (adapted for word-level vs standard)
      const isWordLevel = assessment.passage_type === 'words';
      const introPrompt = isWordLevel
        ? `Generate a brief message in language code "${userLanguage}" saying:
1. Great reading! Now let's check vocabulary understanding
2. I'll ask 3 questions about the words
3. Student can answer in voice or tap buttons
4. Warm, encouraging tone
5. Maximum 3 sentences
6. NO markdown`
        : `Generate a brief message in language code "${userLanguage}" saying:
1. Great reading! Now let's check comprehension
2. I'll ask ${questions.length} questions about the passage
3. Student can answer in voice (Urdu/Punjabi/English all accepted)
4. Warm, encouraging tone
5. Maximum 3 sentences
6. NO markdown`;

      const introResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: introPrompt }],
        temperature: 0.5,
        max_tokens: 100
      });

      const introMessage = introResponse.choices[0].message.content.trim();
      await WhatsAppService.sendMessage(phoneNumber, introMessage);

      // BUG #38 FIX: Set comprehension status BEFORE sending first question
      // Race condition: User could respond with voice before status was set, causing
      // findActiveFlowByUser() to return null and routing answer to general conversation
      // Confirmed case: Waqas (923005233742) had 3 failed assessments on Jan 20, 2026
      const RedisComprehensionService = require('../redis-comprehension.service');
      await RedisComprehensionService.startFlow(
        assessment.id,
        questions,
        assessment.user_id
      );

      logToFile('Comprehension flow started in DATABASE (Bug #38 fix - status set before question)', {
        assessmentId: assessment.id,
        questionCount: questions.length
      });

      // Send first question AFTER status is set (handle image questions for word-level)
      const firstQuestion = questions[0];
      await this._sendComprehensionQuestion(
        phoneNumber,
        firstQuestion,
        1,
        questions.length
      );

      logToFile('First comprehension question sent (Bug #38 fix - safe for immediate response)', {
        assessmentId: assessment.id,
        questionType: firstQuestion.type
      });

    } catch (error) {
      logToFile('❌ Error starting comprehension flow', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Bug #7: Send comprehension question with appropriate format
   * Handles both text-only questions and image+button questions (word-level)
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {object} question - Question object with type, question text, optional imageUrl/buttons
   * @param {number} questionNumber - Current question number (1-indexed)
   * @param {number} totalQuestions - Total number of questions
   * @returns {Promise<void>}
   */
  static async _sendComprehensionQuestion(phoneNumber, question, questionNumber, totalQuestions) {
    try {
      const questionLabel = `Question ${questionNumber}/${totalQuestions}: `;

      // Check if this is an image question (receptive vocabulary - word-level)
      if (question.imageUrl && question.buttons) {
        logToFile('🖼️ Sending image question with buttons', {
          questionNumber,
          imageUrl: question.imageUrl,
          buttonCount: question.buttons.length
        });

        // Send image with interactive buttons
        await WhatsAppService.sendImageWithButtons(
          phoneNumber,
          question.imageUrl,
          questionLabel + question.question,
          question.buttons
        );
      } else {
        // Standard text question
        await WhatsAppService.sendMessage(
          phoneNumber,
          questionLabel + question.question
        );
      }

      logToFile('✅ Comprehension question sent', {
        questionNumber,
        totalQuestions,
        questionType: question.type,
        hasImage: !!question.imageUrl
      });
    } catch (error) {
      logToFile('❌ Error sending comprehension question', {
        questionNumber,
        error: error.message
      });
      // Fallback to text-only if image send fails
      if (question.imageUrl) {
        logToFile('⚠️ Falling back to text-only question');
        await WhatsAppService.sendMessage(
          phoneNumber,
          `Question ${questionNumber}/${totalQuestions}: ${question.question}`
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Sprint 1.8: Generate combined fluency + comprehension report
   * Called after all comprehension questions are answered
   * @param {string} assessmentId - Assessment ID
   * @param {string} userId - User ID
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<void>}
   */
  static async generateCombinedReport(assessmentId, userId, phoneNumber, userLanguage) {
    try {
      logToFile('📊 Generating combined fluency + comprehension report', { assessmentId });

      // Fetch complete assessment with comprehension results
      const { data: assessment } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (!assessment) {
        throw new Error('Assessment not found');
      }

      // Get user data for teacher name
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', assessment.user_id)
        .single();

      const teacherName = user ? `${user.first_name} ${user.last_name}`.trim() : 'Unknown';

      // Build report data structure (same as generateReport)
      const reportData = {
        studentIdentifier: assessment.student_identifier || 'Student',
        teacherName: teacherName,
        assessmentDate: new Date(assessment.created_at).toLocaleDateString(),
        language: assessment.language,
        gradeLevel: assessment.grade_level,
        passageType: assessment.passage_type,
        passageText: assessment.passage_text,
        wcpm: assessment.words_correct_per_minute || assessment.wcpm,
        accuracy: assessment.word_accuracy || assessment.accuracy_percentage,
        timeElapsed: assessment.audio_duration_seconds || assessment.time_elapsed_seconds,
        wordsCorrect: assessment.words_correct,
        totalWords: assessment.passage_word_count || assessment.total_words_in_passage,
        benchmark: {
          benchmarkMin: assessment.grade_benchmark_min,
          benchmarkMax: assessment.grade_benchmark_max,
          onTrack: assessment.on_track,  // Bug #21 Fix: Use correct column name
          percentileRank: assessment.percentile_rank
        },
        errors: assessment.error_breakdown || assessment.errors || [],
        // Bug #23 Fix: Use pronunciation_data (which exists) instead of pronunciation_score (which doesn't exist)
        pronunciation: assessment.pronunciation_data ? {
          pronunciationData: assessment.pronunciation_data,
          // Include words array for mispronunciation extraction
          words: assessment.pronunciation_data.words || []
        } : null,
        diagnosticSummary: assessment.diagnostic_summary || assessment.phonetic_guidance || 'Analysis in progress...'
      };

      // Add comprehension data if available
      if (assessment.comprehension_answers && assessment.comprehension_score !== null) {
        const answers = assessment.comprehension_answers;
        const correctAnswers = answers.filter(a => a.correct).length;
        const totalQuestions = answers.length;
        const score = assessment.comprehension_score;

        // Determine benchmark status based on score
        let benchmarkStatus;
        if (score >= 80) {
          benchmarkStatus = {
            label: 'Excellent Comprehension',
            color: '#10B981',
            description: 'Student demonstrates strong understanding of the passage'
          };
        } else if (score >= 60) {
          benchmarkStatus = {
            label: 'Good Comprehension',
            color: '#F59E0B',
            description: 'Student shows adequate understanding with room for improvement'
          };
        } else {
          benchmarkStatus = {
            label: 'Needs Support',
            color: '#EF4444',
            description: 'Student requires additional support with reading comprehension'
          };
        }

        // ALWAYS translate student answers to English for proper PDF rendering
        const translatedAnswers = await Promise.all(
          answers.map(async (answer) => {
            let translatedStudentAnswer = answer.studentAnswer || '';
            const originalAnswer = translatedStudentAnswer;

            // ALWAYS translate if language is not English
            const needsTranslation = assessment.language !== 'en' && translatedStudentAnswer;

            if (needsTranslation) {
              try {
                const languageName = assessment.language === 'ur' ? 'Urdu' :
                                    assessment.language === 'ar' ? 'Arabic' :
                                    assessment.language === 'es' ? 'Spanish' : 'this language';
                const translatePrompt = `Translate this ${languageName} text to English. Just provide the translation, no explanations:\n\n${translatedStudentAnswer}`;
                const translateResponse = await openai.chat.completions.create({
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: translatePrompt }],
                  temperature: 0.3,
                  max_tokens: 100
                });
                translatedStudentAnswer = translateResponse.choices[0].message.content.trim();

                logToFile('✓ Answer translated for combined report', {
                  from: assessment.language,
                  original: originalAnswer.substring(0, 50),
                  translated: translatedStudentAnswer.substring(0, 50)
                });
              } catch (error) {
                logToFile('⚠️ Translation error in combined report', {
                  error: error.message,
                  original: translatedStudentAnswer
                });
              }
            }

            return {
              ...answer,
              studentAnswer: translatedStudentAnswer,
              originalAnswer: originalAnswer
            };
          })
        );

        reportData.comprehension = {
          score: score,
          correctAnswers: correctAnswers,
          totalQuestions: totalQuestions,
          benchmarkStatus: benchmarkStatus,
          answers: translatedAnswers // Use translated answers
        };
      }

      // Generate new PDF report with both fluency and comprehension sections
      const ReportService = require('./report.service');
      const reportBuffer = await ReportService.generateReadingAssessmentReport(reportData);

      // Upload to R2
      // BUG #33 FIX: Use format "Reading Assessment_Student Name_DDMMYYYY.pdf"
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

      const date = new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const dateStr = `${day}${month}${year}`;
      const studentName = assessment.student_identifier || 'Student';
      // Fixed naming convention: Fluency_Only or Fluency_Comprehension
      const reportType = assessment.comprehension_score !== null && assessment.comprehension_score !== undefined ?
        'Fluency_Comprehension' : 'Fluency_Only';
      const fileName = `${reportType}_${studentName}_${dateStr}.pdf`;
      const key = `reading_reports/${userId}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: reportBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          userId: userId,
          assessmentId: assessmentId,
          generatedAt: new Date().toISOString()
        }
      });

      await r2Client.send(command);

      const publicUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;

      // Update assessment with combined report URL
      await supabase
        .from('reading_assessments')
        .update({
          report_pdf_url: publicUrl,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', assessmentId);

      // Send combined report to teacher
      await this.sendResults(assessment, publicUrl, phoneNumber, userLanguage);

      // Generate and send voice feedback (includes both fluency and comprehension)
      try {
        const voiceFeedbackUrl = await this.generateVoiceFeedback(assessment, userLanguage);

        // Bug #1 Fix: Add defensive logging for comprehension flow voice feedback
        logToFile('🔍 Combined voice feedback generation result', {
          assessmentId,
          voiceFeedbackUrl: voiceFeedbackUrl || 'NULL/UNDEFINED',
          urlType: typeof voiceFeedbackUrl,
          hasUrl: !!voiceFeedbackUrl
        });

        if (voiceFeedbackUrl) {
          await supabase
            .from('reading_assessments')
            .update({
              voice_feedback_url: voiceFeedbackUrl
            })
            .eq('id', assessmentId);

          logToFile('📤 Attempting to send combined voice feedback', {
            assessmentId,
            phoneNumber,
            voiceFeedbackUrl
          });

          await WhatsAppService.sendAudioFromUrl(phoneNumber, voiceFeedbackUrl);
          logToFile('✅ Combined voice feedback sent', { assessmentId });
        } else {
          logToFile('⚠️ Combined voice feedback URL is null/falsy - skipping delivery', {
            assessmentId,
            voiceFeedbackUrl
          });
        }
      } catch (voiceError) {
        logToFile('⚠️ Voice feedback generation failed (non-critical)', {
          assessmentId,
          error: voiceError.message,
          stack: voiceError.stack
        });
      }

      logToFile('✅ Combined report generated and sent', { assessmentId });

      // Suggest next feature after reading assessment completion
      try {
        await FeatureLinkerService.suggestNext(
          'reading',
          userId,
          phoneNumber,
          userLanguage,
          { assessmentId }
        );
      } catch (error) {
        logToFile('⚠️ Error in feature linker after reading', { error: error.message });
      }

      // Check and trigger registration if needed (non-blocking)
      try {
        await FeatureRegistrationService.checkAndTriggerRegistration(
          userId,
          'reading',
          phoneNumber,
          userLanguage,
          'voice' // Reading assessments use voice
        );
      } catch (regError) {
        logToFile('Registration trigger error (non-fatal)', { error: regError.message });
      }

    } catch (error) {
      logToFile('❌ Error generating combined report', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  /**
   * Calculate composite score with research-based weighting (60/40 split)
   * Based on DIBELS & EGRA methodology showing ORF correlation r=0.91
   * @param {number} fluencyScore - WCPM or fluency percentage
   * @param {number|null} comprehensionScore - Comprehension percentage (null for fluency-only)
   * @returns {number} Weighted composite score
   */
  static calculateCompositeScore(fluencyScore, comprehensionScore = null) {
    if (comprehensionScore === null || comprehensionScore === undefined) {
      // Fluency-only assessment
      return Math.round(fluencyScore);
    }

    // Research-based weights (60% fluency, 40% comprehension)
    const FLUENCY_WEIGHT = 0.60;
    const COMPREHENSION_WEIGHT = 0.40;

    const composite = Math.round(
      (fluencyScore * FLUENCY_WEIGHT) +
      (comprehensionScore * COMPREHENSION_WEIGHT)
    );

    logToFile('📊 Composite score calculated', {
      fluencyScore,
      comprehensionScore,
      composite,
      formula: `${fluencyScore}*0.6 + ${comprehensionScore}*0.4 = ${composite}`
    });

    return composite;
  }

  /**
   * Get overall risk level based on composite score
   * @param {number} compositeScore - Weighted composite score
   * @returns {object} Risk level with color and action
   */
  static getOverallRiskLevel(compositeScore) {
    if (compositeScore >= 80) {
      return {
        level: 'At/Above Benchmark',
        color: '#10B981',
        action: 'Continue regular instruction',
        description: 'Student is meeting or exceeding grade-level expectations'
      };
    }
    if (compositeScore >= 60) {
      return {
        level: 'Strategic Support',
        color: '#F59E0B',
        action: 'Provide targeted intervention',
        description: 'Student needs some additional support to reach grade level'
      };
    }
    return {
      level: 'Intensive Support',
      color: '#EF4444',
      action: 'Immediate intensive intervention needed',
      description: 'Student requires significant support in both fluency and comprehension'
    };
  }

  /**
   * Calculate fluency percentage from WCPM and benchmark
   * @param {number} wcpm - Words correct per minute
   * @param {string} gradeLevel - Grade level
   * @param {string} language - Language code
   * @returns {number} Fluency percentage (0-100)
   */
  static calculateFluencyPercentage(wcpm, gradeLevel, language) {
    // Get benchmark for grade and language
    const benchmarks = {
      'en': {
        '1': { min: 30, target: 60, stretch: 90 },
        '2': { min: 50, target: 90, stretch: 120 },
        '3': { min: 70, target: 110, stretch: 140 },
        '4': { min: 90, target: 130, stretch: 160 },
        '5': { min: 100, target: 140, stretch: 180 }
      },
      'ur': {
        // L2-adjusted benchmarks (25-30% lower)
        '1': { min: 21, target: 42, stretch: 63 },
        '2': { min: 35, target: 63, stretch: 84 },
        '3': { min: 49, target: 77, stretch: 98 },
        '4': { min: 63, target: 91, stretch: 112 },
        '5': { min: 70, target: 98, stretch: 126 }
      }
    };

    const langBenchmarks = benchmarks[language] || benchmarks['en'];
    const gradeBenchmark = langBenchmarks[gradeLevel] || langBenchmarks['3'];

    // Calculate percentage (0-100 scale, capped at 100)
    const percentage = Math.min(100, Math.round((wcpm / gradeBenchmark.target) * 100));

    return percentage;
  }
}

module.exports = AnalysisService;
