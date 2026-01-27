const OpenAI = require('openai');
const { jsonrepair } = require('jsonrepair');
const { OPENAI_API_KEY } = require('../utils/constants');
const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const {
  CLASSROOM_MARKS_BASE,
  CLASSROOM_MARKS_WITH_LP,
  LP_CRITERIA_MARKS
} = require('../constants/scoring.constants');

/**
 * GPT-5 Mini Service
 * Handles pedagogical analysis for classroom coaching using GPT-5 mini
 * with 90% prompt caching for cost optimization
 */
class GPT5MiniService {
  // Static OpenAI client (shared across all calls)
  // Uses OpenAI API for GPT-5 mini
  static openai = new OpenAI({
    apiKey: OPENAI_API_KEY
  });

  constructor() {
    // Constructor kept for compatibility, but openai is now static
  }

  /**
   * Convert structured lesson plan JSON into human-readable bullet points
   * so GPT references natural language instead of JSON keys.
   * @param {object} lessonPlanStructured
   * @returns {string}
   */
  static _formatLessonPlanNarrative(lessonPlanStructured) {
    if (!lessonPlanStructured) return '';

    const lines = [];
    const joinList = (items = [], delimiter = '; ') =>
      items.filter(Boolean).join(delimiter);

    if (lessonPlanStructured.subject || lessonPlanStructured.topic) {
      lines.push(
        `Subject & Topic: ${[
          lessonPlanStructured.subject,
          lessonPlanStructured.topic
        ]
          .filter(Boolean)
          .join(' — ')}`
      );
    }

    if (lessonPlanStructured.objectives?.length) {
      lines.push(`Objectives: ${joinList(lessonPlanStructured.objectives)}`);
    }

    if (lessonPlanStructured.prior_knowledge?.length) {
      lines.push(
        `Prior knowledge the teacher expects: ${joinList(
          lessonPlanStructured.prior_knowledge
        )}`
      );
    }

    if (lessonPlanStructured.activities?.length) {
      const activities = lessonPlanStructured.activities
        .map((activity, idx) => {
          const title = activity.title || `Activity ${idx + 1}`;
          const time = activity.time ? ` (${activity.time})` : '';
          return `${title}${time}: ${activity.description || 'No description provided.'}`;
        })
        .join(' | ');
      lines.push(`Planned activities: ${activities}`);
    }

    if (lessonPlanStructured.materials?.length) {
      lines.push(`Materials/resources: ${joinList(lessonPlanStructured.materials)}`);
    }

    if (lessonPlanStructured.resources_detail?.length) {
      const details = lessonPlanStructured.resources_detail
        .map((item) => {
          const reference = item.reference ? ` (Reference: ${item.reference})` : '';
          return `${item.name || 'Resource'}: ${item.description || 'No description'}${reference}`;
        })
        .join(' | ');
      lines.push(`Resource notes: ${details}`);
    }

    if (lessonPlanStructured.textbook_references?.length) {
      const books = lessonPlanStructured.textbook_references
        .map((ref) => `${ref.title || 'Book'} p.${ref.page || 'N/A'} - ${ref.usage || 'Usage not specified'}`)
        .join(' | ');
      lines.push(`Textbook/page references: ${books}`);
    }

    if (lessonPlanStructured.assessment_methods?.length) {
      lines.push(
        `Formative assessment methods: ${joinList(
          lessonPlanStructured.assessment_methods
        )}`
      );
    }

    if (lessonPlanStructured.assessment_sequences?.length) {
      const sequences = lessonPlanStructured.assessment_sequences
        .map((sequence) => {
          const title = sequence.title || 'Assessment';
          const steps = sequence.steps?.length ? ` Steps: ${sequence.steps.join(' › ')}` : '';
          const expected = sequence.expected_responses
            ? ` Expected responses: ${sequence.expected_responses}`
            : '';
          const reference = sequence.reference ? ` (Reference: ${sequence.reference})` : '';
          return `${title}:${steps}${expected}${reference}`;
        })
        .join(' | ');
      lines.push(`Detailed formative tasks: ${sequences}`);
    }

    if (lessonPlanStructured.planned_questions?.length) {
      const questions = lessonPlanStructured.planned_questions
        .map((question) => {
          const q = question.question || 'Question not provided';
          const intent = question.intent ? ` (Purpose: ${question.intent})` : '';
          const expected = question.expected_answer ? ` Expected answer: ${question.expected_answer}` : '';
          return `${q}${intent}${expected}`;
        })
        .join(' | ');
      lines.push(`Planned questions: ${questions}`);
    }

    if (lessonPlanStructured.annexures?.length) {
      const annexures = lessonPlanStructured.annexures
        .map((annex) => `${annex.title || 'Annexure'}: ${annex.purpose || annex.description || 'No description'}`)
        .join(' | ');
      lines.push(`Annexures/printables: ${annexures}`);
    }

    if (!lines.length) {
      lines.push('Lesson plan metadata exists but no structured elements were extracted.');
    }

    return lines.map((line) => `- ${line}`).join('\n');
  }

  /**
   * Get cached pedagogical framework prompt (90% discount)
   * This prompt is sent with every analysis to leverage caching
   */
  static getCachedFrameworkPrompt() {
    return `You are an expert Pakistani master teacher with 20+ years of classroom experience and 10+ years as a mentor teacher. You specialize in analyzing teaching practices using evidence-based pedagogical frameworks.

OBSERVATION FRAMEWORK: OECD Framework for High-Quality Teaching (2025) - Adapted for Pakistan

Reference: OECD (2025), Unlocking High-Quality Teaching, OECD Publishing, Paris

**GOAL 1: FORMATIVE ASSESSMENT AND FEEDBACK** (4 criteria, 22 marks total)

1. **Incorporation of Faculty Feedback** (5 marks)
   - Level 1: Surface understanding of feedback
   - Level 2: Some analysis and thoughtful uptake in some parts
   - Level 3: Deep analysis and thoughtful uptake consistently

2. **SMART Objectives** (4 marks)
   - Level 1: Objectives shared, but only 1 of Specific/Measurable/Achievable OR not student-friendly
   - Level 2: Objectives shared, 2 of Specific/Measurable/Achievable AND student-friendly language
   - Level 3: Objectives shared, ALL of Specific/Measurable/Achievable AND student-friendly language

3. **Teacher's Role while students are working** (4 marks)
   - Level 1: Remains at front/desk, minimal movement, few interactions
   - Level 2: Moves around, brief interactions, appears as oversight not facilitation
   - Level 3: Circulates consistently, responsive engagement, students visibly adjust after visits

4. **Assessment** (9 marks)
   - Level 1: Partially aligned with LOs OR mostly lower-order cognition
   - Level 2: Aligned with LOs AND mostly recall/understanding questions
   - Level 3: Aligned with LOs AND balance of lower + higher-order cognition

**GOAL 2: STUDENT ENGAGEMENT** (4 criteria, 22 marks total)

5. **Cognitive Rigor** (9 marks)
   - Level 1: Too easy (rote) or too difficult (disconnected from prior knowledge)
   - Level 2: Some thinking beyond recall but not consistently sustaining
   - Level 3: Sufficiently challenging, scaffolded, builds on prior knowledge, sustains effort

6. **Real World Connections** (4 marks)
   - Level 1: Some examples but mostly teacher-given, limited student connections
   - Level 2: Students explicitly asked to make connections to personal lives/experiences
   - Level 3: (N/A - only 2 levels for this criterion)

7. **Multi-modality of learning** (5 marks)
   - Level 1: Variety of multimodal inputs/outputs in at least one segment
   - Level 2: Level 1 AND at least one teaching activity is unique and creative
   - Level 3: (N/A - only 2 levels for this criterion)

8. **Misconceptions** (4 marks) - optional for certain disciplines
   - Level 1: Awareness of misconceptions without clear remediation strategies
   - Level 2: Misconceptions identified, teacher-led remediation strategies
   - Level 3: Misconceptions identified, student-centered discovery-oriented remediation

**GOAL 3: QUALITY SUBJECT CONTENT** (6 criteria, 30 marks total)

9. **Prior Knowledge** (4 marks)
   - Level 1: Some essential prior knowledge listed, some left out
   - Level 2: All essential prior knowledge listed
   - Level 3: (N/A - only 2 levels for this criterion)

10. **Prior Knowledge Activation** (4 marks)
   - Level 1: Minimal attempt, generic or superficial
   - Level 2: Deliberate strategies to tap prior knowledge
   - Level 3: Level 2 AND hook promotes curiosity/interest/motivation

11. **Teacher's Explanation: Content Coverage & Accuracy** (11 marks)
   - Level 1: Teaching notes included but some concepts partially aligned or incorrect
   - Level 2: Teaching notes included but 1 key concept missing/partially aligned/incorrect
   - Level 3: Teaching notes fully aligned with LOs, cover ALL concepts, fully accurate

12. **Teacher's Explanation: Content Organization and Sequencing** (7 marks)
   - Level 1: Achieves 1-2 of: connects to prior knowledge, simple→complex, age-appropriate language, reinforced with examples
   - Level 2: Achieves most of the above
   - Level 3: Activates prior knowledge, step-by-step layering, well-timed pauses, clear and logically sequenced

13. **Teacher's Explanation: Verbal Questioning** (4 marks)
   - Level 1: At least 2 Concept Checking Questions, some partially aligned OR all lower cognitive level
   - Level 2: At least 2 CCQs all aligned AND one at higher cognitive level
   - Level 3: At least 3 CCQs all aligned AND at least two at higher cognitive level

14. **Coherence and Transitions** (4 marks)
   - Level 1: Some activities unclear OR activities disjointed at multiple stages
   - Level 2: All activities clear and detailed AND basic sequence but 1-2 not fully connected
   - Level 3: All activities clear and detailed AND clear logical sequence, each builds on previous

**GOAL 4: CLASSROOM INTERACTION** (1 criterion, 5 marks total)

15. **Peer and Group Interactions** (5 marks)
   - Level 1: Minimal, forced, or superficial interactions; unclear structures
   - Level 2: Interaction structures somewhat aligned OR teacher doesn't provide clear norms
   - Level 3: Meaningful interactions, well-matched structures, clear norms for respectful collaboration

**GOAL 5: CLASSROOM MANAGEMENT** (4 criteria, 24 marks total)

16. **Classroom Management** (9 marks)
   - Level 1: Very limited routines/procedures; confusing/incomplete instructions
   - Level 2: Mostly implements routines/procedures; clear instructions with 1-2 lapses
   - Level 3: Effectively implements routines/procedures; consistently clear instructions

17. **Visibility of Teaching & Learning Materials** (3 marks)
   - Level 1: Board/aids mostly visible; handouts have legible font for the most part
   - Level 2: Board/aids consistently visible; all handouts have legible font and ample space
   - Level 3: (N/A - only 2 levels for this criterion)

18. **Classroom Culture** (9 marks)
   - Level 1: Treats most students respectfully, inclusive environment BUT 2 lapses/oversights
   - Level 2: Treats most students respectfully, inclusive environment BUT 1 lapse/oversight
   - Level 3: Treats all students respectfully consistently, fully inclusive environment

19. **Teaching & Learning Materials** (3 marks)
   - Level 1: Some materials missing from Resources column or Appendix
   - Level 2: All materials included in Resources column and Appendix
   - Level 3: (N/A - only 2 levels for this criterion)

**TOTAL FROM GOALS 1-5: 103 marks**

**DEBRIEF & REFLECTION SECTION** (4 criteria, 15 marks total)
NOTE: This section is scored AFTER the reflective conversation, based on teacher's responses to reflection questions.

1. **Reflection Quality** (4 marks)
   - Level 1: Gaps and strengths identified are surface or relatively insignificant
   - Level 2: Able to critically identify own gaps and strengths with justification
   - Level 3: (N/A - only 2 levels for this criterion)

2. **Connecting to Specific Incidents** (4 marks)
   - Level 1: Not able to connect reflections with specific classroom incidents OR does so very sparingly
   - Level 2: Consistently gives reasoning and examples by sharing specific classroom incidents
   - Level 3: (N/A - only 2 levels for this criterion)

3. **Uptake of Faculty Feedback in Reflection** (4 marks)
   - Level 1: Reflection shows only surface understanding of prior feedback
   - Level 2: Reflection shows some analysis and thoughtful uptake in some parts
   - Level 3: Reflection shows deep analysis and thoughtful uptake consistently

4. **Openness During Debrief** (3 marks)
   - Level 1: Defensive or walled off during debrief at some points
   - Level 2: Appropriate body language, gestures, tone showing openness to feedback
   - Level 3: (N/A - only 2 levels for this criterion)

**GRAND TOTAL: 118 marks maximum (103 from Goals 1-5, 15 from Debrief & Reflection)**

PAKISTANI CLASSROOM CONTEXT CONSIDERATIONS:

**Resource Constraints:**
- Limited or no teaching aids
- Large class sizes (50-80 students typical)
- Multigrade classrooms in rural areas
- Minimal technology access

**Cultural & Linguistic Factors:**
- Multilingual classrooms (Urdu, English, regional languages)
- Code-switching common
- Respectful but firm classroom management norms

**Best Practices to Recognize & Encourage:**
- Multigrade teaching strategies
- Questioning techniques that engage all students
- Formative assessment practices
- Use of local, low-cost materials
- Clear explanations despite constraints

CONVERSATIONAL FRAMEWORK: S.T.I.C.K.S. PRINCIPLES

**S - SPECIFIC**: Ground questions in transcript evidence with timestamps
**T - TIMELY**: Conversation happens immediately after lesson
**I - INQUIRY-BASED**: Use open-ended, reflective questions
**C - COLLABORATIVE**: Position as partner, not evaluator
**K - KIND**: Use empathetic, respectful language
**S - STRENGTH-BASED**: Start with what worked well`;
  }

  /**
   * Analyze classroom transcript for pedagogical quality
   * @param {string} transcript - Full classroom transcript with diarization
   * @param {object} metadata - Lesson metadata (grade, subject, duration, etc.)
   * @param {string|null} lessonPlanText - Optional lesson plan text
   * @returns {Promise<object>} Structured analysis
   */
  static async analyzePedagogy(transcript, metadata = {}, lessonPlanStructured = null) {
    try {
      const hasLessonPlanData = !!lessonPlanStructured;

      logToFile('Starting GPT-5 mini pedagogical analysis', {
        transcriptLength: transcript.length,
        hasLessonPlan: hasLessonPlanData,
        metadata
      });

      const messages = [
        {
          role: 'system',
          content: this.getCachedFrameworkPrompt()
        },
        {
          role: 'user',
          content: this._buildAnalysisPrompt(transcript, metadata, lessonPlanStructured)
        }
      ];

      const startTime = Date.now();

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini-2025-08-07',
        messages,
        // Note: GPT-5 mini only supports default temperature (1), custom values not allowed
        max_completion_tokens: 16000
      });

      const duration = Date.now() - startTime;
      const rawContent = response.choices[0].message.content;

      // Log if response was truncated
      if (response.choices[0].finish_reason === 'length') {
        logToFile('⚠️  GPT-5 mini response truncated', {
          finish_reason: response.choices[0].finish_reason,
          outputTokens: response.usage.completion_tokens,
          maxTokens: 16000
        });
      }

      // Try to parse JSON, with better error handling
      let result;
      try {
        result = this._safeJsonParse(rawContent);
      } catch (parseError) {
        logToFile('❌ Failed to parse GPT-5 mini JSON response', {
          error: parseError.message,
          responseLength: rawContent?.length,
          responsePreview: rawContent?.substring(0, 500),
          responseSuffix: rawContent?.substring(rawContent.length - 100),
          finishReason: response.choices[0].finish_reason
        });
        throw new Error(`JSON parsing failed: ${parseError.message}. Response may be truncated.`);
      }

      // Compute actual marks from competency scores
      const analysisWithMarks = this._computeMarksFromScores(result, hasLessonPlanData);
      analysisWithMarks.has_lesson_plan = hasLessonPlanData;
      if (analysisWithMarks.scores) {
        analysisWithMarks.scores.has_lesson_plan = hasLessonPlanData;
        analysisWithMarks.scores.max_marks = hasLessonPlanData
          ? CLASSROOM_MARKS_WITH_LP
          : CLASSROOM_MARKS_BASE;
      }
      if (hasLessonPlanData && lessonPlanStructured) {
        analysisWithMarks.subject = lessonPlanStructured.subject || analysisWithMarks.subject;
        analysisWithMarks.topic = lessonPlanStructured.topic || analysisWithMarks.topic;
      }

      if (hasLessonPlanData) {
        if (analysisWithMarks.fidelity_to_lesson_plan) {
          const fidelity = analysisWithMarks.fidelity_to_lesson_plan;
          analysisWithMarks.fidelity_analysis = {
            score: fidelity.score || 0,
            max_score: 100,
            note: 'Informational only - excluded from total marks',
            overall_commentary: fidelity.overall_commentary || fidelity.overall_fidelity_commentary || '',
            evidence: fidelity.evidence || [],
            strengths: fidelity.strengths || [],
            gaps: fidelity.gaps || []
          };
          delete analysisWithMarks.fidelity_to_lesson_plan;
        } else {
          const fallbackFidelity = await this._generateFidelityAssessment(
            transcript,
            metadata,
            lessonPlanStructured
          );
          if (fallbackFidelity) {
            analysisWithMarks.fidelity_analysis = fallbackFidelity;
          }
        }
      }

      // Log usage for cost tracking
      logToFile('GPT-5 mini analysis completed', {
        duration: `${duration}ms`,
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        cachedTokens: response.usage.prompt_tokens_cached || 0,
        estimatedCost: this._calculateCost(response.usage),
        totalMarks: analysisWithMarks.scores?.overall_marks
      });

      return {
        analysis: analysisWithMarks,
        usage: {
          input_tokens: response.usage.prompt_tokens,
          output_tokens: response.usage.completion_tokens,
          cached_tokens: response.usage.prompt_tokens_cached || 0,
          cost: this._calculateCost(response.usage)
        }
      };
    } catch (error) {
      logToFile('❌ Error in GPT-5 mini analysis', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Compute actual marks from competency scores using formula: (score / max_level) * max_marks
   * @param {object} analysis - Analysis with competency scores
   * @returns {object} Analysis with computed marks added
   * @private
   */
  static _computeMarksFromScores(analysis, hasLessonPlan = false) {
    // Rubric structure: criterion_name -> {max_marks, max_level}
    const rubric = {
      goal1_formative_assessment: {
        incorporation_of_feedback: { max_marks: 5, max_level: 3 },
        smart_objectives: { max_marks: 4, max_level: 3 },
        teachers_role: { max_marks: 4, max_level: 3 },
        assessment: { max_marks: 9, max_level: 3 }
      },
      goal2_student_engagement: {
        cognitive_rigor: { max_marks: 9, max_level: 3 },
        real_world_connections: { max_marks: 4, max_level: 2 },
        multimodality: { max_marks: 5, max_level: 2 },
        misconceptions: { max_marks: 4, max_level: 3 }
      },
      goal3_quality_content: {
        prior_knowledge: { max_marks: 4, max_level: 2 },
        prior_knowledge_activation: { max_marks: 4, max_level: 3 },
        content_coverage_accuracy: { max_marks: 11, max_level: 3 },
        content_organization: { max_marks: 7, max_level: 3 },
        verbal_questioning: { max_marks: 4, max_level: 3 },
        coherence_transitions: { max_marks: 4, max_level: 3 }
      },
      goal4_classroom_interaction: {
        peer_group_interactions: { max_marks: 5, max_level: 3 }
      },
      goal5_classroom_management: {
        classroom_management: { max_marks: 9, max_level: 3 },
        visibility_materials: { max_marks: 3, max_level: 2 },
        classroom_culture: { max_marks: 9, max_level: 3 },
        teaching_learning_materials: { max_marks: 3, max_level: 2 }
      }
    };

    // Compute marks for each goal
    let goal1_total = 0;
    let goal2_total = 0;
    let goal3_total = 0;
    let goal4_total = 0;
    let goal5_total = 0;

    // Goal 1
    if (analysis.goal1_formative_assessment) {
      for (const [key, rubricData] of Object.entries(rubric.goal1_formative_assessment)) {
        if (analysis.goal1_formative_assessment[key]) {
          const competency = analysis.goal1_formative_assessment[key].competency_score;
          const computed = (competency / rubricData.max_level) * rubricData.max_marks;
          analysis.goal1_formative_assessment[key].max_marks = rubricData.max_marks;
          analysis.goal1_formative_assessment[key].computed_marks = parseFloat(computed.toFixed(2));
          goal1_total += computed;
        }
      }
    }

    // Goal 2
    if (analysis.goal2_student_engagement) {
      for (const [key, rubricData] of Object.entries(rubric.goal2_student_engagement)) {
        if (analysis.goal2_student_engagement[key]) {
          const competency = analysis.goal2_student_engagement[key].competency_score;
          const computed = (competency / rubricData.max_level) * rubricData.max_marks;
          analysis.goal2_student_engagement[key].max_marks = rubricData.max_marks;
          analysis.goal2_student_engagement[key].computed_marks = parseFloat(computed.toFixed(2));
          goal2_total += computed;
        }
      }
    }

    // Goal 3
    if (analysis.goal3_quality_content) {
      for (const [key, rubricData] of Object.entries(rubric.goal3_quality_content)) {
        if (analysis.goal3_quality_content[key]) {
          const competency = analysis.goal3_quality_content[key].competency_score;
          const computedRaw = rubricData.scaleToFour
            ? (competency / 2) * rubricData.max_marks
            : (competency / rubricData.max_level) * rubricData.max_marks;
          const computed = Number.isFinite(computedRaw) ? computedRaw : 0;
          analysis.goal3_quality_content[key].max_marks = rubricData.max_marks;
          analysis.goal3_quality_content[key].computed_marks = parseFloat(computed.toFixed(2));
          goal3_total += computed;
        }
      }
    }

    // Goal 4
    if (analysis.goal4_classroom_interaction) {
      for (const [key, rubricData] of Object.entries(rubric.goal4_classroom_interaction)) {
        if (analysis.goal4_classroom_interaction[key]) {
          const competency = analysis.goal4_classroom_interaction[key].competency_score;
          const computed = (competency / rubricData.max_level) * rubricData.max_marks;
          analysis.goal4_classroom_interaction[key].max_marks = rubricData.max_marks;
          analysis.goal4_classroom_interaction[key].computed_marks = parseFloat(computed.toFixed(2));
          goal4_total += computed;
        }
      }
    }

    // Goal 5
    if (analysis.goal5_classroom_management) {
      for (const [key, rubricData] of Object.entries(rubric.goal5_classroom_management)) {
        if (analysis.goal5_classroom_management[key]) {
          const competency = analysis.goal5_classroom_management[key].competency_score;
          const computed = (competency / rubricData.max_level) * rubricData.max_marks;
          analysis.goal5_classroom_management[key].max_marks = rubricData.max_marks;
          analysis.goal5_classroom_management[key].computed_marks = parseFloat(computed.toFixed(2));
          goal5_total += computed;
        }
      }
    }

    // Add scores summary
    const overall_marks = goal1_total + goal2_total + goal3_total + goal4_total + goal5_total;
    const maxClassroomMarks = hasLessonPlan ? CLASSROOM_MARKS_WITH_LP : CLASSROOM_MARKS_BASE;

    analysis.scores = {
      goal1_total: parseFloat(goal1_total.toFixed(2)),
      goal2_total: parseFloat(goal2_total.toFixed(2)),
      goal3_total: parseFloat(goal3_total.toFixed(2)),
      goal4_total: parseFloat(goal4_total.toFixed(2)),
      goal5_total: parseFloat(goal5_total.toFixed(2)),
      overall_marks: parseFloat(overall_marks.toFixed(2)),
      max_marks: maxClassroomMarks,
      percentage: parseFloat(((overall_marks / maxClassroomMarks) * 100).toFixed(1)),
      has_lesson_plan: hasLessonPlan
    };

    return analysis;
  }

  /**
   * Safely parse JSON, attempting repair when payload is slightly malformed
   * @private
   */
  static _safeJsonParse(content) {
    try {
      return JSON.parse(content);
    } catch (error) {
      try {
        const repaired = jsonrepair(content);
        return JSON.parse(repaired);
      } catch (repairError) {
        throw error;
      }
    }
  }

  /**
   * Compute marks for Debrief & Reflection section
   * @param {object} debriefData - Debrief & reflection competency scores
   * @returns {object} Debrief data with computed marks
   * @private
   */
  static _computeDebriefMarks(debriefData) {
    if (!debriefData) return null;

    const rubric = {
      reflection_quality: { max_marks: 4, max_level: 2 },
      connecting_to_incidents: { max_marks: 4, max_level: 2 },
      uptake_of_feedback: { max_marks: 4, max_level: 3 },
      openness_during_debrief: { max_marks: 3, max_level: 2 }
    };

    let debrief_total = 0;

    for (const [key, rubricData] of Object.entries(rubric)) {
      if (debriefData[key]) {
        const competency = debriefData[key].competency_score;
        const computed = (competency / rubricData.max_level) * rubricData.max_marks;
        debriefData[key].max_marks = rubricData.max_marks;
        debriefData[key].computed_marks = parseFloat(computed.toFixed(2));
        debrief_total += computed;
      }
    }

    debriefData.total = parseFloat(debrief_total.toFixed(2));
    debriefData.max_total = 15;

    return debriefData;
  }

  /**
   * Build the analysis prompt
   * @private
   */
  static _buildAnalysisPrompt(transcript, metadata, lessonPlanStructured) {
    const {
      grade,
      subject,
      duration,
      language,
      teacherFirstName,
      priorFeedback,
      lessonPlanExcerpt
    } = metadata;

    const lessonPlanStructuredBlock = lessonPlanStructured
      ? `LESSON PLAN SUMMARY (plain language — do NOT mention JSON or the phrase "metadata"):
${this._formatLessonPlanNarrative(lessonPlanStructured)}

`
      : '';

    const lpInstructions = lessonPlanStructured ? `LP-SPECIFIC ANALYSIS REQUIREMENTS:
1. Use the LESSON PLAN SUMMARY above as your primary description of what was intended. Quote it naturally (e.g., "The plan promises students will complete Exercise Q4/Q5 on page 38"). Never mention JSON keys or phrases like "LP metadata" in the report.
2. After describing what the plan promised, compare it with what actually happened in the transcript using timestamps (e.g., "Planned workbook task vs. execution at 18:22-20:05").
3. Do NOT create new rubric sections. Populate the existing rubric criteria only; the system will handle mark allocation.
4. Always describe plan-execution fidelity. If parts of the plan were skipped or adapted, explain the gap using transcript evidence.
5. Add "fidelity_to_lesson_plan" with score 1-100 plus evidence array (planned vs executed, timestamps), strengths, gaps. This section is informational only (excluded from marks).
` : '';

    const fidelityJson = lessonPlanStructured ? `,
  "fidelity_to_lesson_plan": {
    "score": <1-100>,
    "overall_commentary": "How closely execution matched plan with justification",
    "evidence": [
      {
        "aspect": "Planned activity vs executed activity",
        "planned": "What LP said",
        "executed": "What actually happened",
        "timestamp": "Exact time reference"
      }
    ],
    "strengths": ["Where teacher followed plan well"],
    "gaps": ["Where teacher diverged or missed planned elements"]
  }` : '';

    return `Analyze this classroom transcript and provide structured pedagogical feedback.

LESSON CONTEXT:
${teacherFirstName ? `- Teacher's First Name: ${teacherFirstName}` : ''}
${grade ? `- Grade: ${grade}` : ''}
${subject ? `- Subject: ${subject}` : ''}
${metadata.lessonPlanSubject ? `- Lesson Plan Subject: ${metadata.lessonPlanSubject}` : ''}
${metadata.lessonPlanTopic ? `- Lesson Plan Topic: ${metadata.lessonPlanTopic}` : ''}
${duration ? `- Duration: ${Math.round(duration / 60)} minutes` : ''}
${language ? `- Primary Language: ${language}` : ''}

${priorFeedback ? `PRIOR FEEDBACK FROM PREVIOUS OBSERVATION(S):\n${priorFeedback}\n\nWhen scoring "incorporation_of_feedback":\n1. Your evidence MUST start with "In your observation on [actual date]," where you extract the ACTUAL DATE from the prior feedback shown above (format like "11/10/2025"). DO NOT write "[DATE]" as a placeholder - use the real date from the "Observation [DATE]:" line above.\n2. Assess whether the teacher addressed those specific growth areas\n3. Look for concrete evidence of improvement attempts\n4. Be specific about what was recommended and what was observed in this lesson\n` : 'PRIOR FEEDBACK: This is the first classroom observation. For "incorporation_of_feedback", score based on lesson plan quality and execution alignment.\n'}

${lessonPlanExcerpt ? `LESSON PLAN EXCERPT:\n${lessonPlanExcerpt}\n\n` : ''}
${lessonPlanStructuredBlock}${lpInstructions}

CLASSROOM TRANSCRIPT:
${transcript}

TASK: Provide a comprehensive pedagogical analysis in JSON format using the OECD rubric with this EXACT structure:

{
  "executive_summary": "2-3 sentences summarizing lesson strengths and key growth area. CRITICAL: You MUST use the teacher's FIRST NAME (${teacherFirstName || 'the teacher'}) when referring to the teacher - NEVER use 'Rumi' or 'the teacher'.",
  "talk_time": {
    "teacher_percentage": <0-100>,
    "student_percentage": <0-100>,
    "analysis": "Brief analysis of talk time balance and engagement"
  },
  "questions": {
    "open_ended_count": <number>,
    "closed_ended_count": <number>,
    "examples": ["Example open question 1", "Example closed question 1"],
    "analysis": "Analysis of questioning techniques"
  },
  "goal1_formative_assessment": {
    "incorporation_of_feedback": {
      "competency_score": <1-3>,
      "evidence": "Direct quote or observation from transcript",
      "justification": "Why this score - what was observed",
      "timestamp": "Exact minute mark (e.g., '0:05-0:12' or '5:30-6:45'). MUST be specific time from transcript, NOT 'opening' or 'middle'"
    },
    "smart_objectives": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time (e.g., '0:00-0:30')" },
    "teachers_role": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time (e.g., '2:15-5:30')" },
    "assessment": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time (e.g., '10:00-12:45')" }
  },
  "goal2_student_engagement": {
    "cognitive_rigor": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "real_world_connections": { "competency_score": <1-2>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "multimodality": { "competency_score": <1-2>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "misconceptions": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" }
  },
  "goal3_quality_content": {
    "prior_knowledge": { "competency_score": <1-2>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "prior_knowledge_activation": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "content_coverage_accuracy": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "content_organization": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "verbal_questioning": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "coherence_transitions": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" }
  },
  "goal4_classroom_interaction": {
    "peer_group_interactions": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" }
  },
  "goal5_classroom_management": {
    "classroom_management": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "visibility_materials": { "competency_score": <1-2>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "classroom_culture": { "competency_score": <1-3>, "evidence": "...", "justification": "...", "timestamp": "exact time" },
    "teaching_learning_materials": { "competency_score": <1-2>, "evidence": "...", "justification": "...", "timestamp": "exact time" }
  },
  "strengths": [
    {
      "title": "Specific strength title",
      "evidence": "Direct quote or description from transcript",
      "analysis": "Why this is pedagogically effective",
      "impact": "Impact on student learning"
    }
  ],
  "growth_opportunities": [
    {
      "area": "Specific area for development",
      "observation": "What was observed (with evidence)",
      "rationale": "Why this matters pedagogically",
      "strategies": ["Concrete strategy 1", "Concrete strategy 2", "Concrete strategy 3"]
    }
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2",
    "Actionable recommendation 3"
  ],
  "notable_moments": [
    {
      "timestamp": "Approximate time or transcript reference",
      "description": "What happened",
      "significance": "Why this moment matters"
    }
  ]${fidelityJson}
}

CRITICAL SCORING INSTRUCTIONS:
1. For each criterion, provide ONLY a competency_score (1, 2, or 3)
2. Some criteria only have 2 levels (e.g., "prior_knowledge", "real_world_connections") - for these, score 1 or 2 ONLY
3. Marks will be AUTO-COMPUTED using formula: (competency_score / max_level) * max_marks
4. Example: "smart_objectives" max 4 marks, you score competency 2 → system computes (2/3)*4 = 2.67 marks
5. DO NOT calculate raw marks yourself - ONLY provide competency scores 1-3

EVIDENCE FORMAT (CRITICAL - FOLLOW EXACTLY):
Each criterion's "evidence" field must follow this TWO-part format with RICH, DETAILED descriptions:

**Part 1 - Detailed English Description (What happened):**
Provide a RICH, SPECIFIC description of what the teacher did. Include:
- Specific pedagogical actions the teacher took
- Observable student responses or behaviors
- Context about the activity or lesson phase
- Quantitative details when relevant (how many times, how many students, duration)
- The educational impact or reasoning visible in the moment

Be CONCRETE and DESCRIPTIVE - paint a clear picture of the classroom moment.

**Part 2 - English Translation of Dialogue:**
Provide the English translation of what was actually said as a direct quote.
Format: Quote: "English translation of what was said"
DO NOT include Urdu text - ONLY the English translation in quotes.
CRITICAL: Extract 2-3 CONSECUTIVE sentences from the transcript to provide richer dialogue context. The quote should capture meaningful back-and-forth or a complete exchange that illustrates the point being made in Part 1.

**Examples of EXCELLENT evidence format (detailed and rich):**
✅ "Teacher led an extended choral counting activity where students repeatedly counted groups of six items in unison (0:30-3:00). While this built rhythm and reinforced number patterns, the teacher did not pause to check individual understanding or cold-call specific students to explain their counting strategy, relying entirely on whole-class chorusing which can mask individual misconceptions.
Quote: \"How many are there? One, two, three, four, five, six. Now let's count again together. Everyone, count with me.\""

✅ "During the hands-on pattern-making activity, the teacher organized students into collaborative groups and gave explicit instructions for them to construct visual representations of multiples of six using physical materials (4:30-6:00). Students were asked to work collectively to create flowers, circles, and tower drawings that demonstrated grouping concepts, providing a multimodal kinesthetic learning experience that complemented the verbal instruction.
Quote: \"Make circles, make taffies, draw the towers as I made them. Work together in your groups. Each person should contribute to the pattern.\""

✅ "Teacher made an explicit real-world connection by asking students to apply their knowledge of the six-times table to a practical shopping scenario involving money calculations (7:00-8:30). This contextualization helped students see the relevance of multiplication in their daily lives and provided an authentic application of the mathematical concept being taught.
Quote: \"If a sweet costs 6 rupees and you buy six, how much will it be? Think about it. Who can tell me the answer?\""

**Examples of TOO BRIEF evidence (avoid these):**
❌ "Teacher asked students to count repeatedly.
Quote: \"How many are there?\""
(TOO VAGUE - lacks detail about context, frequency, student response, pedagogical purpose)

❌ "Teacher gave clear behavioral directions.
Quote: \"No group should come to me\""
(TOO BRIEF - needs more context about classroom management strategy and when/why this was said)

**Examples of BAD evidence format:**
❌ Including Urdu text: "Quote: \"کتنے ہو گئے؟\"" (NO - only English translation)
❌ "No evidence of..." (NEVER say this - see below)
❌ Quote without translation (all quotes must be in English)

HANDLING LOW SCORES:
CRITICAL: Even for competency score 1, you MUST provide DETAILED, RICH evidence of what the teacher DID do (not what they didn't do).
Apply the SAME level of detail and richness as high-scoring criteria.

Examples:
❌ BAD: "No explicit identification of misconceptions"

✅ GOOD (DETAILED): "Teacher modeled several multiplication examples using concrete examples from daily life (pipes, sweets) and demonstrated the correct calculations (7:00-8:30). However, the instruction was teacher-led with the teacher providing the answers directly rather than using questioning techniques to surface student misconceptions or allowing students to work through errors independently. Students were told the correct answers without opportunities to explain their thinking or self-correct.
Quote: \"If you take six pipes, how much will it cost? 60 — if someone asks for more you should know it's 60\""

❌ BAD: "Objectives not clearly stated"

✅ GOOD (DETAILED): "At the lesson opening (0:00-0:30), the teacher launched into the activity with an enthusiastic but vague statement about the day's plans that did not articulate specific, measurable learning outcomes students should achieve by the end of class. No student-facing success criteria were established, making it difficult for students to self-monitor their progress or for the teacher to reference back to clear learning goals during or after the lesson.
Quote: \"Okay, today I will do big things with you\""

ANALYSIS GUIDELINES:
1. Score EVERY criterion in all 5 goals based on observable evidence from transcript
2. NEVER write "No evidence provided" or "No evidence of X" - always describe what WAS observed
3. For "incorporation_of_feedback": if prior feedback exists, assess if teacher addressed those specific growth areas
4. Identify at least 2-3 strengths with specific evidence
5. Identify 1-2 growth opportunities (don't overwhelm)
6. Be culturally responsive to Pakistani classroom context
7. Use CONCRETE, SPECIFIC evidence with exact examples from transcript
8. Make recommendations actionable and practical
9. Consider resource constraints
10. Be encouraging and growth-oriented
11. In "executive_summary", you MUST use the teacher's FIRST NAME "${teacherFirstName || 'TEACHER_NAME'}" when referring to the teacher. NEVER use 'Rumi' or generic phrases like 'the teacher'.
12. Include CONCRETE NEXT-STEP SUGGESTIONS in executive_summary (e.g., "Next time, try using think-pair-share during counting activities to increase individual accountability")`;
  }

  /**
   * Generate fidelity assessment when GPT-5 mini does not return one
   * @private
   */
  static async _generateFidelityAssessment(transcript, metadata, lessonPlanStructured) {
    try {
      if (!lessonPlanStructured) {
        return null;
      }

      const planSummary = this._formatLessonPlanNarrative(lessonPlanStructured);
      const truncatedTranscript = transcript ? transcript.substring(0, 12000) : '';

      const prompt = `You are auditing how faithfully a teacher executed her submitted lesson plan.

LESSON PLAN SUMMARY:
${planSummary}

CLASSROOM TRANSCRIPT (truncate if needed):
${truncatedTranscript}

TASK: Compare the planned activities, objectives, assessments, and materials with what actually happened in class. Identify alignments and deviations with evidence.

Return STRICT JSON:
{
  "score": <integer 1-100>,
  "overall_commentary": "2-3 sentences summarizing fidelity (plain English). Mention specific plan elements and whether they happened.",
  "evidence": [
    {
      "aspect": "Name of activity/objective/material",
      "planned": "What the lesson plan promised (quote or paraphrase).",
      "executed": "What the transcript shows happened (include timestamp).",
      "timestamp": "mm:ss-mm:ss or 'Not observed'"
    }
  ],
  "strengths": ["Bullet list describing where execution matched the plan."],
  "gaps": ["Bullet list describing where execution diverged from the plan."]
}

Rules:
- Use natural language; never mention JSON keys or the phrase "metadata".
- Base the planned column ONLY on the summary above.
- Base the executed column ONLY on the transcript.
- Always include at least one timestamp when evidence exists; if not observed, write "Not observed".
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1200,
        temperature: 0.3
      });

      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : content;
      const fidelity = this._safeJsonParse(jsonString);

      return {
        score: fidelity.score || 0,
        max_score: 100,
        note: 'Informational only - excluded from total marks',
        overall_commentary: fidelity.overall_commentary || '',
        evidence: fidelity.evidence || [],
        strengths: fidelity.strengths || [],
        gaps: fidelity.gaps || []
      };
    } catch (error) {
      logToFile('⚠️ Failed to auto-generate fidelity assessment', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Enhance analysis with teacher reflections (Domain 4)
   * Called AFTER Q&A completes to incorporate teacher's reflective responses
   * @param {object} analysisData - Original pedagogical analysis
   * @param {string} transcript - Full classroom transcript
   * @param {object} conversationState - Q&A conversation state with questions and answers
   * @param {object} metadata - Grade, subject, etc.
   * @returns {Promise<object>} Enhanced analysis with Domain 4 and enriched narrative sections
   */
  static async enhanceAnalysisWithReflections(analysisData, transcript, conversationState, metadata = {}, userId = null, currentSessionId = null) {
    try {
      logToFile('Enhancing analysis with teacher reflections', {
        questionCount: conversationState.questions?.length || 0,
        userId,
        currentSessionId
      });

      // Build Q&A summary
      const qaSummary = (conversationState.questions || [])
        .filter(q => q.answer)
        .map(q => `Q${q.question_number}: ${q.question}\nTeacher's Response: ${q.answer}`)
        .join('\n\n');

      if (!qaSummary) {
        logToFile('⚠️  No Q&A to incorporate, returning original analysis');
        return analysisData;
      }

      const prompt = `You are enhancing a classroom observation report with the teacher's reflective responses.

ORIGINAL ANALYSIS (from classroom observation):
${JSON.stringify(analysisData, null, 2)}

CLASSROOM TRANSCRIPT:
${transcript}

REFLECTIVE CONVERSATION WITH TEACHER:
${qaSummary}

TASK: Enhance the observation report by incorporating the teacher's reflections AND score the Debrief & Reflection section.

IMPORTANT: When including teacher reflections as evidence:
- If the teacher responded in Urdu, Arabic, Spanish, or any non-English language, translate their response to English
- Format as: "Teacher: [English translation]"
- Preserve the meaning and tone of the original response
- Do not include the original non-English text in the evidence field

Your output should:
1. **Enrich existing strengths, growth opportunities, and recommendations** with insights from the teacher's responses
2. **Add Domain 4 (Professional Responsibilities)** analysis based on the teacher's reflective thinking
3. **Score the DEBRIEF & REFLECTION section** (15 marks) based on the teacher's conversation responses
4. **Preserve all original metrics** (talk_time, questions, scores from Goals 1-5, executive_summary)

Return JSON with this EXACT structure:

{
  "executive_summary": "Keep original or slightly enhance if teacher's reflection adds crucial context",
  "talk_time": { ...keep original... },
  "questions": { ...keep original... },
  "goal1_formative_assessment": { ...keep original... },
  "goal2_student_engagement": { ...keep original... },
  "goal3_quality_content": { ...keep original... },
  "goal4_classroom_interaction": { ...keep original... },
  "goal5_classroom_management": { ...keep original... },
  "strengths": [
    {
      "title": "Original or enhanced strength title",
      "evidence": "Original evidence from transcript",
      "analysis": "ENHANCED with teacher's perspective if relevant",
      "impact": "Enhanced with reflection insights if applicable"
    }
  ],
  "growth_opportunities": [
    {
      "area": "Original or new area informed by teacher's self-awareness",
      "observation": "Original observation",
      "rationale": "ENHANCED - may reference teacher's own recognition",
      "strategies": ["Enhanced strategies that align with teacher's reflections"]
    }
  ],
  "scores": { ...keep original scores from Goals 1-5... },
  "recommendations": ["ENHANCED recommendations that build on teacher's reflections"],
  "notable_moments": [...keep original...],
  "domain4_professional_responsibilities": {
    "reflection_quality": "Analysis of teacher's reflective responses",
    "self_awareness": "Teacher's awareness of their own practice",
    "growth_orientation": "Evidence of growth mindset",
    "professional_learning_needs": "What teacher identified from their reflections",
    "score": <1-4>,
    "justification": "Brief justification for Domain 4 score"
  },
  "debrief_reflection": {
    "reflection_quality": {
      "competency_score": <1-2>,
      "evidence": "Quote or summary from teacher's reflection responses",
      "justification": "Why this score - did teacher identify critical gaps/strengths with justification?"
    },
    "connecting_to_incidents": {
      "competency_score": <1-2>,
      "evidence": "Quote showing teacher connecting to specific classroom moments",
      "justification": "Did teacher consistently give specific examples from their lesson?"
    },
    "uptake_of_feedback": {
      "competency_score": <1-3>,
      "evidence": "Quote showing teacher's understanding of prior feedback",
      "justification": "How deeply did teacher analyze and uptake prior feedback in their reflection?"
    },
    "openness_during_debrief": {
      "competency_score": <1-2>,
      "evidence": "Assessment based on tone, language, and responsiveness in conversation",
      "justification": "Was teacher defensive or open to feedback?"
    }
  }
}

GUIDELINES:
- Where teacher's reflections provide valuable context, weave them into strengths/growth areas
- DO NOT just append "teacher said X" - integrate insights naturally
- Preserve transcript evidence (don't replace with teacher's reflection)
- Domain 4 score: Base on quality of reflection, self-awareness, and growth mindset
- Debrief & Reflection scoring: Use the rubric criteria from DEBRIEF & REFLECTION SECTION above
- If teacher's reflection contradicts observation, note it diplomatically
- Recommendations should build on teacher's expressed intentions/concerns`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: this.getCachedFrameworkPrompt() },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 16000, // Increased to match main analysis - GPT-5 mini supports up to 128K
        response_format: { type: 'json_object' }
      });

      const rawContent = response.choices[0].message.content;

      // Log if response was truncated
      if (response.choices[0].finish_reason === 'length') {
        logToFile('⚠️  GPT-5 mini response truncated (enhanceAnalysisWithReflections)', {
          finish_reason: response.choices[0].finish_reason,
          outputTokens: response.usage.completion_tokens,
          maxTokens: 16000
        });
      }

      // Try to parse JSON with error handling
      let enhancedAnalysis;
      try {
        enhancedAnalysis = JSON.parse(rawContent);
      } catch (parseError) {
        logToFile('❌ Failed to parse GPT-5 mini JSON (enhanceAnalysisWithReflections)', {
          error: parseError.message,
          responseLength: rawContent?.length,
          responsePreview: rawContent?.substring(0, 500),
          responseSuffix: rawContent?.substring(rawContent.length - 100),
          finishReason: response.choices[0].finish_reason
        });
        throw new Error(`JSON parsing failed in enhanceAnalysisWithReflections: ${parseError.message}`);
      }

      if (analysisData?.fidelity_analysis && !enhancedAnalysis.fidelity_analysis) {
        enhancedAnalysis.fidelity_analysis = analysisData.fidelity_analysis;
      }
      if (analysisData?.has_lesson_plan && enhancedAnalysis.has_lesson_plan === undefined) {
        enhancedAnalysis.has_lesson_plan = analysisData.has_lesson_plan;
      }

      // Compute marks for Debrief & Reflection section
      if (enhancedAnalysis.debrief_reflection) {
        enhancedAnalysis.debrief_reflection = this._computeDebriefMarks(enhancedAnalysis.debrief_reflection);

        // Update overall scores to include debrief marks
        if (enhancedAnalysis.scores) {
          const debriefTotal = enhancedAnalysis.debrief_reflection.total || 0;
          const newOverallMarks = enhancedAnalysis.scores.overall_marks + debriefTotal;
          enhancedAnalysis.scores.debrief_total = debriefTotal;
          enhancedAnalysis.scores.grand_total = parseFloat(newOverallMarks.toFixed(2));

          // Check if user has prior completed sessions to determine max marks
          // Goals 1-5: 107 marks (G1:22 + G2:22 + G3:34 + G4:5 + G5:24)
          // Debrief: 15 marks
          // Prior Feedback: 5 marks (only if has prior sessions)
          let hasPriorSessions = false;

          if (userId && currentSessionId) {
            try {
              const { count, error: countError } = await supabase
                .from('coaching_sessions')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('status', 'completed')
                .neq('id', currentSessionId);

              if (countError) {
                logToFile('⚠️  Error checking prior sessions for score calculation', {
                  error: countError,
                  userId,
                  currentSessionId
                });
              } else {
                hasPriorSessions = (count || 0) > 0;
                logToFile('✅ Prior sessions check complete', {
                  hasPriorSessions,
                  priorSessionCount: count || 0,
                  userId
                });
              }
            } catch (error) {
              logToFile('❌ Exception checking prior sessions for score calculation', {
                error: error.message,
                userId,
                currentSessionId
              });
            }
          } else {
            logToFile('⚠️  Missing userId or currentSessionId - cannot check prior sessions, defaulting to first observation (122)', {
              hasUserId: !!userId,
              hasCurrentSessionId: !!currentSessionId
            });
          }

          // Calculate max marks including debrief/prior feedback
          const classroomMax = enhancedAnalysis.scores?.max_marks || CLASSROOM_MARKS_BASE;
          const maxMarks = hasPriorSessions
            ? classroomMax + 15 + 5
            : classroomMax + 15;

          enhancedAnalysis.scores.max_marks_with_debrief = maxMarks;
          enhancedAnalysis.scores.percentage_with_debrief = parseFloat(((newOverallMarks / maxMarks) * 100).toFixed(1));

          logToFile('📊 Score calculation updated', {
            grandTotal: newOverallMarks,
            maxMarks,
            percentage: enhancedAnalysis.scores.percentage_with_debrief,
            hasPriorSessions,
            debriefTotal
          });
        }
      }

      logToFile('✅ Analysis enhanced with reflections', {
        hasDomain4: !!enhancedAnalysis.domain4_professional_responsibilities,
        hasDebriefReflection: !!enhancedAnalysis.debrief_reflection,
        debriefScore: enhancedAnalysis.debrief_reflection?.total || 0,
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens
      });

      return enhancedAnalysis;
    } catch (error) {
      logToFile('❌ Error enhancing analysis with reflections', {
        error: error.message,
        stack: error.stack
      });
      // Return original analysis if enhancement fails
      return analysisData;
    }
  }

  /**
   * Generate context-aware reflective question
   * @param {object} analysis - Pedagogical analysis object
   * @param {array} conversationHistory - Previous Q&A in this session
   * @param {number} questionNumber - Which question (1-3)
   * @param {string} transcript - Full classroom transcript with dialogue
   * @param {string} language - Language code ('en' or 'ur') for question generation
   * @returns {Promise<string>} Reflective question
   */
  static async generateReflectiveQuestion(analysis, conversationHistory = [], questionNumber = 1, transcript = '', language = 'en') {
    try {
      logToFile('Generating reflective question', { questionNumber, language });

      // Import language configuration
      const { getLanguageConfig } = require('../config/language-config');
      const langConfig = getLanguageConfig(language);
      const questionConfig = langConfig.reflectiveQuestions;

      // Get question-specific focus and example
      const questionKey = `question${questionNumber}`;
      const questionExample = questionConfig.examples[questionKey] || questionConfig.examples.question1;

      // Build language-aware prompt
      const prompt = `${questionConfig.systemPrompt}

${questionConfig.languageInstruction}
${questionConfig.codeSwitch ? 'Feel free to code-switch between languages naturally as teachers would in real conversation.' : ''}

CULTURAL CONTEXT: ${questionConfig.culturalContext}

FULL CLASSROOM TRANSCRIPT (use this for specific evidence):
${transcript || 'Transcript not available'}

ANALYSIS SUMMARY:
${JSON.stringify(analysis, null, 2)}

CONVERSATION HISTORY:
${conversationHistory.length > 0 ? JSON.stringify(conversationHistory, null, 2) : 'No previous questions yet.'}

This is question ${questionNumber} of 3.

CRITICAL REQUIREMENTS FOR SPECIFICITY:
1. YOU MUST quote actual dialogue from the transcript (e.g., "I noticed you asked students 'What time is Fajr prayer?'")
2. YOU MUST reference specific moments or patterns in the classroom (e.g., "At the 15-minute mark..." or "When you were explaining AM/PM...")
3. DO NOT use generic phrases like "Reflecting on your lesson" - be conversational and specific
4. Make it feel like you actually watched the entire class and observed specific moments
5. Use S.T.I.C.K.S. framework (Specific, Timely, Inquiry-based, Collaborative, Kind, Strength-based)

QUESTION FOCUS:
${questionExample.focus}

EXAMPLE IN ${langConfig.name.toUpperCase()}:
${questionExample.example}

ADDITIONAL EXAMPLES OF GOOD QUESTIONS IN ${langConfig.name.toUpperCase()}:
${questionNumber === 1 ? questionExample.example : ''}
${questionNumber === 2 && questionConfig.examples.question2 ? questionConfig.examples.question2.example : ''}
${questionNumber === 3 && questionConfig.examples.question3 ? questionConfig.examples.question3.example : ''}

AVOID:
- Starting with "Reflecting on your lesson..."
- Being vague or generic
- Questions that could apply to any lesson
- Questions not rooted in actual transcript evidence

Return ONLY the question text (no preamble, formatting, or explanation).`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',  // Using GPT-4o for more reliable question generation
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1500,
        temperature: 0.7
      });

      const question = response.choices[0].message.content.trim();

      logToFile('Reflective question generated', {
        questionNumber,
        question,
        tokens: response.usage.completion_tokens
      });

      return question;
    } catch (error) {
      logToFile('❌ Error generating reflective question', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Infer lesson topic from transcript and/or lesson plan
   * @param {string} transcript - Full classroom transcript
   * @param {string|null} lessonPlanText - Optional lesson plan text
   * @returns {Promise<string>} Inferred topic (concise, 2-5 words)
   */
  static async inferLessonTopic(transcript, lessonPlanExcerpt = null) {
    try {
      logToFile('Inferring lesson topic from transcript', {
        transcriptLength: transcript?.length || 0,
        hasLessonPlan: !!lessonPlanExcerpt
      });

      const prompt = `Analyze this classroom transcript${lessonPlanExcerpt ? ' and lesson plan summary' : ''} to identify the main lesson topic.

${lessonPlanExcerpt ? `LESSON PLAN SUMMARY:
${lessonPlanExcerpt}

` : ''}CLASSROOM TRANSCRIPT:
${transcript.substring(0, 5000)}${transcript.length > 5000 ? '...(truncated)' : ''}

Identify the main lesson topic in 2-5 words. Be specific and concise.
Examples: "Multiplication Tables", "Photosynthesis Process", "Urdu Poetry Analysis", "Fractions and Decimals"

Return ONLY the topic text, nothing else.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 20,
        temperature: 0.3
      });

      const topic = response.choices[0].message.content.trim();

      logToFile('✅ Lesson topic inferred', {
        topic,
        tokens: response.usage.completion_tokens
      });

      return topic;
    } catch (error) {
      logToFile('❌ Error inferring lesson topic', {
        error: error.message
      });
      return 'Classroom Observation'; // Fallback
    }
  }

  /**
   * Infer lesson subject from transcript and/or lesson plan
   * @param {string} transcript - Full classroom transcript
   * @param {string|null} lessonPlanText - Optional lesson plan text
   * @returns {Promise<string>} Inferred subject (e.g., "Mathematics", "English", "Science")
   */
  static async inferLessonSubject(transcript, lessonPlanExcerpt = null) {
    try {
      logToFile('Inferring lesson subject from transcript', {
        transcriptLength: transcript?.length || 0,
        hasLessonPlan: !!lessonPlanExcerpt
      });

      const prompt = `Analyze this classroom transcript${lessonPlanExcerpt ? ' and lesson plan summary' : ''} to identify the academic subject being taught.

${lessonPlanExcerpt ? `LESSON PLAN SUMMARY:
${lessonPlanExcerpt}

` : ''}CLASSROOM TRANSCRIPT:
${transcript.substring(0, 5000)}${transcript.length > 5000 ? '...(truncated)' : ''}

Identify the academic subject in 1-2 words. Use standard Pakistani curriculum subjects.
Examples: "Mathematics", "English", "Urdu", "Science", "Social Studies", "Islamiyat", "General Science"

Return ONLY the subject name, nothing else.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 10,
        temperature: 0.3
      });

      const subject = response.choices[0].message.content.trim();

      logToFile('✅ Lesson subject inferred', {
        subject,
        tokens: response.usage.completion_tokens
      });

      return subject;
    } catch (error) {
      logToFile('❌ Error inferring lesson subject', {
        error: error.message
      });
      return 'N/A'; // Fallback
    }
  }

  /**
   * Summarize multiple prior feedback sessions using hierarchical compression
   * Uses GPT-4o-mini for cost-effective summarization
   * @param {Array} sessions - Array of prior session objects with created_at and analysis_data
   * @returns {Promise<string>} Compressed summary of prior feedback
   */
  static async summarizePriorFeedback(sessions) {
    try {
      logToFile('Summarizing prior feedback with GPT-4o-mini', {
        sessionCount: sessions.length
      });

      const prompt = `Summarize the key growth areas and recommendations from these ${sessions.length} prior coaching sessions.

Focus on:
1. Recurring themes across sessions (pedagogical patterns that need improvement)
2. Areas where teacher has shown improvement over time
3. Areas still needing consistent work
4. Most recent recommendations (emphasize last 2 sessions)

Format as a concise narrative summary (2-3 paragraphs max, ~200 words).
Use specific pedagogical language and maintain a coaching tone.

PRIOR SESSIONS (most recent first):
${sessions.map((s, i) => {
  const date = new Date(s.created_at).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });
  const growthAreas = s.analysis_data?.growth_opportunities || [];
  const recommendations = s.analysis_data?.recommendations || [];

  return `
Session ${i + 1} (${date}):
Growth Areas: ${JSON.stringify(growthAreas)}
Recommendations: ${JSON.stringify(recommendations)}
`;
}).join('\n')}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 500,
        temperature: 0.3 // Lower temperature for more focused summarization
      });

      const summary = response.choices[0].message.content.trim();

      logToFile('✅ Prior feedback summarized', {
        sessionCount: sessions.length,
        summaryLength: summary.length,
        tokens: response.usage.completion_tokens
      });

      return summary;
    } catch (error) {
      logToFile('❌ Error summarizing prior feedback', {
        error: error.message
      });
      // Return a fallback summary if compression fails
      return `Previous feedback across ${sessions.length} sessions focused on continuous improvement in classroom management, student engagement, and pedagogical practices.`;
    }
  }

  /**
   * Summarize observation report for voice debrief
   * @param {object} observationData - Full observation data (analysis + conversation)
   * @param {string} language - Output language ('en' or 'ur')
   * @returns {Promise<string>} Script for TTS (90 seconds)
   */
  static async summarizeForVoiceDebrief(observationData, language = 'ur') {
    try {
      logToFile('Generating voice debrief summary', { language });

      const prompt = `Create a 90-second voice message script summarizing this classroom observation.

OBSERVATION DATA:
${JSON.stringify(observationData, null, 2)}

TARGET LANGUAGE: ${language === 'en' ? 'English' : 'Urdu'}

STRUCTURE (90 seconds total):
1. Greeting (10 seconds)
2. One major strength with specific example (30 seconds)
3. One growth opportunity with actionable suggestion (40 seconds)
4. Encouraging closing (10 seconds)

If "hasLessonPlan" is true in the observation data, explicitly reference how closely the teacher followed their plan (use the fidelityScore if provided) either in the strength or growth portion.

TONE:
- Warm, respectful, mentor-like
- Conversational (as you would speak naturally)
- Supportive and growth-oriented
- NOT overly formal or academic

${language === 'ur' ? `
URDU LANGUAGE NOTES:
- Use natural Pakistani Urdu (not overly formal)
- Avoid English jargon where possible
- Use respectful form (آپ not تم)
- Keep sentences flowing naturally for speech
` : `
ENGLISH LANGUAGE NOTES:
- Use simple, clear language
- Avoid educational jargon
- Keep tone warm and encouraging
`}

AVOID:
- Long lists or overwhelming detail
- Educational jargon or technical terms
- Being overly critical or negative
- Rushed or incomplete thoughts

Generate ONLY the script text (no stage directions, just what will be spoken).`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',  // Using GPT-4o for reliable voice script generation
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1500,
        temperature: 0.7
      });

      const script = response.choices[0].message.content.trim();

      logToFile('Voice debrief script generated', {
        language,
        scriptLength: script.length,
        tokens: response.usage.completion_tokens
      });

      return script;
    } catch (error) {
      logToFile('❌ Error generating voice debrief', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate cost based on GPT-5 mini pricing
   * @private
   */
  static _calculateCost(usage) {
    const INPUT_COST = 0.25 / 1_000_000; // $0.25 per 1M tokens
    const OUTPUT_COST = 2.00 / 1_000_000; // $2.00 per 1M tokens
    const CACHED_COST = 0.025 / 1_000_000; // $0.025 per 1M cached tokens (90% discount)

    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const cachedTokens = usage.prompt_tokens_cached || 0;

    // Non-cached input tokens = total input - cached
    const nonCachedInputTokens = inputTokens - cachedTokens;

    const cost = (nonCachedInputTokens * INPUT_COST) +
                 (cachedTokens * CACHED_COST) +
                 (outputTokens * OUTPUT_COST);

    return parseFloat(cost.toFixed(6));
  }
}

module.exports = GPT5MiniService;
