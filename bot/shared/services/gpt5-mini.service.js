const { jsonrepair } = require('jsonrepair');
const { logToFile } = require('../utils/logger');
const supabase = require('../config/supabase');
const { getClient } = require('./llm-client');
const {
  CLASSROOM_MARKS_BASE,
  CLASSROOM_MARKS_WITH_LP,
  LP_CRITERIA_MARKS
} = require('../constants/scoring.constants');

/**
 * GPT-5 Mini Service
 * Handles pedagogical analysis for classroom coaching
 * with 90% prompt caching for cost optimization
 */
class GPT5MiniService {
  // Use the shared LLM client (supports OpenRouter + OpenAI)
  static openai = getClient();

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
    return `You are an expert Pakistani master teacher with 20+ years of classroom experience and 10+ years as a mentor teacher. You specialize in analyzing teaching practices using evidence-based pedagogical frameworks focused on Higher-Order Thinking Skills (HOTS).

OBSERVATION FRAMEWORK: HOTS Classroom Observation Tool (COT) — Higher-Order Thinking Skills
Reference: GPE/UNICEF Higher Order Thinking Skills Teachers' Training Module (2023)

This tool evaluates 16 indicators across 5 areas, each scored on a 3-point scale:
- **Emerging (1)**: Minimal or surface-level implementation
- **Developing (2)**: Partial implementation with room for growth
- **Proficient (3)**: Consistent, effective implementation

**AREA 1: CLASSROOM MANAGEMENT** (3 indicators, 9 marks total)

1. **Open Discussions & Critical Thinking** (3 marks)
   - Emerging (1): Discussions are teacher-dominated with minimal student input. Example: Students answer only factual questions without follow-up.
   - Developing (2): Some encouragement for discussions, but student participation is limited. Example: Students share ideas, but few questions are asked to probe deeper.
   - Proficient (3): Open discussions are encouraged, with students freely sharing and debating ideas. Example: Students discuss multiple solutions to a problem collaboratively.

2. **Resources & Space Organization** (3 marks)
   - Emerging (1): Resources and space are disorganized, limiting collaborative learning. Example: No designated group work areas or materials for problem-solving tasks.
   - Developing (2): Some organization, but space/resources do not fully support collaboration. Example: Materials are present but not effectively used for group activities.
   - Proficient (3): Resources and space are well-organized for collaborative tasks. Example: Tables are arranged for group work, and materials are easily accessible.

3. **Complex Task Expectations** (3 marks)
   - Emerging (1): Students are given basic tasks without clear expectations. Example: Instructions are vague, and students struggle to engage in complex activities.
   - Developing (2): Some students engage in complex tasks, but expectations are not consistently clear. Example: Instructions lack clarity for all groups.
   - Proficient (3): Students actively participate in complex, clearly defined tasks. Example: The teacher assigns roles for group problem-solving and explains expectations.

**AREA 2: LESSON PLANNING** (3 indicators, 9 marks total)

4. **Objectives Linked to HOTS** (3 marks)
   - Emerging (1): Objectives are vague or focused on rote learning. Example: "Understand the topic" with no reference to critical thinking or problem-solving.
   - Developing (2): Objectives mention higher-order skills but lack detailed alignment with activities. Example: "Analyse the text" without clear support for the analysis.
   - Proficient (3): Objectives are explicit and linked to HOTS. Example: "Evaluate the author's argument and create your counterpoint with supporting evidence."

5. **Analysis, Evaluation & Synthesis Strategies** (3 marks)
   - Emerging (1): Strategies focus on recall and comprehension. Example: Activities ask for definitions but no analysis or synthesis.
   - Developing (2): Some activities promote analysis or synthesis but lack variety or depth. Example: Students analyse a passage but do not synthesize ideas.
   - Proficient (3): Strategies explicitly foster HOTS, including evaluation and synthesis. Example: Students compare arguments and propose their solutions based on evidence.

6. **Interdisciplinary & Real-World Applications** (3 marks)
   - Emerging (1): Lessons are taught in isolation without real-world relevance. Example: Math concepts are taught with no application.
   - Developing (2): Some connections to real-world or interdisciplinary themes, but not fully integrated. Example: Mentioning real-world examples without exploring them.
   - Proficient (3): Lessons integrate real-world applications and interdisciplinary links. Example: Students use math to design a sustainable business model.

**AREA 3: INSTRUCTIONAL STRATEGIES** (4 indicators, 12 marks total)

7. **Open-Ended & Thought-Provoking Questions** (3 marks)
   - Emerging (1): Questions are mostly close-ended, requiring one-word answers. Example: "What is the capital of France?"
   - Developing (2): Some open-ended questions are asked, but they lack depth. Example: "Why is the capital important?" without encouraging further exploration.
   - Proficient (3): Open-ended, thought-provoking questions dominate the lesson. Example: "How would you redesign this city to make it more sustainable?"

8. **Student Analysis, Interpretation & Critique** (3 marks)
   - Emerging (1): Students passively receive information. Example: The teacher explains a text without student critique.
   - Developing (2): Some analysis and critique are encouraged, but it is not consistent. Example: Students are asked to analyse but not interpret or critique.
   - Proficient (3): Students actively analyse, interpret, and critique content. Example: Students critique a historical argument with supporting evidence.

9. **Problem-Solving & Creativity Modeling** (3 marks)
   - Emerging (1): Simple tasks are demonstrated without explanation of the problem-solving process. Example: "This is the solution," without steps.
   - Developing (2): Problem-solving is modeled, but the teacher does not explain strategies. Example: "Let me solve this quickly for you."
   - Proficient (3): Problem-solving and creativity are modeled with clear strategies. Example: The teacher brainstorms solutions and explains the reasoning behind choices.

10. **Scaffolding for Complex Ideas** (3 marks)
   - Emerging (1): Minimal or no scaffolding is provided. Example: Students are asked to solve problems independently without guidance.
   - Developing (2): Some scaffolding is provided, but it is inconsistent. Example: The teacher provides hints but does not guide students through complex steps.
   - Proficient (3): Effective scaffolding supports student exploration. Example: The teacher provides step-by-step guidance and gradually reduces support as students improve.

**AREA 4: STUDENT ENGAGEMENT** (3 indicators, 9 marks total)

11. **Collaborative Synthesis & Problem-Solving** (3 marks)
   - Emerging (1): Collaboration is minimal or absent. Example: Students work individually without interaction.
   - Developing (2): Some collaboration occurs, but tasks lack depth. Example: Students share ideas but do not work towards a synthesized solution.
   - Proficient (3): Collaboration is structured and focused on synthesis and problem-solving. Example: Students work in teams to design a solution to a community problem.

12. **Multiple Perspectives & Novel Solutions** (3 marks)
   - Emerging (1): Content is presented from a single perspective. Example: Students are taught one method without alternatives.
   - Developing (2): Multiple perspectives are mentioned, but exploration is limited. Example: The teacher describes perspectives but doesn't encourage student evaluation.
   - Proficient (3): Students actively explore and evaluate multiple perspectives. Example: Students debate solutions and propose creative alternatives to a problem.

13. **Discussions & Debates on Complex Topics** (3 marks)
   - Emerging (1): Discussions are teacher-led with limited student involvement. Example: The teacher talks, and students answer briefly.
   - Developing (2): Some discussions and debates occur, but only a few students participate. Example: A few students contribute to a debate while others stay silent.
   - Proficient (3): Discussions and debates actively involve all students. Example: Students collaboratively debate and refine their arguments in a group setting.

**AREA 5: ASSESSMENT & FEEDBACK** (3 indicators, 9 marks total)

14. **Self-Assessment & Peer-Assessment** (3 marks)
   - Emerging (1): Assessment is limited to teacher-led grading. Example: Students receive a grade without reflecting on their performance.
   - Developing (2): Some self- or peer-assessment occurs, but it is inconsistent. Example: Students assess each other's work but without clear criteria.
   - Proficient (3): Self- and peer-assessment are structured and purposeful. Example: Students use rubrics to assess their work and suggest improvements for peers.

15. **Feedback for Refining Reasoning** (3 marks)
   - Emerging (1): Feedback is generic and not actionable. Example: "Good job" or "Try again" without specifics.
   - Developing (2): Feedback is specific but does not consistently guide improvement. Example: "You missed this part; try to include it."
   - Proficient (3): Feedback is specific, actionable, and focused on improvement. Example: "Your argument is clear, but adding evidence will make it stronger."

16. **HOTS Assessment Tasks** (3 marks)
   - Emerging (1): Assessment tasks focus on recall and do not involve higher-order thinking. Example: Quizzes with factual questions only.
   - Developing (2): Some tasks involve analysis or evaluation but lack depth. Example: "Write a short analysis" with limited criteria for success.
   - Proficient (3): Assessment tasks consistently require analysis, evaluation, or creation. Example: "Develop a project that evaluates and improves this system."

**TOTAL FROM AREAS 1-5: 48 marks** (16 indicators x 3 marks each)

**DEBRIEF & REFLECTION SECTION** (4 criteria, 15 marks total)
NOTE: This section is scored AFTER the reflective conversation, based on teacher's responses to reflection questions.

1. **Reflection Quality** (4 marks)
   - Level 1: Gaps and strengths identified are surface or relatively insignificant
   - Level 2: Able to critically identify own gaps and strengths with justification

2. **Connecting to Specific Incidents** (4 marks)
   - Level 1: Not able to connect reflections with specific classroom incidents OR does so very sparingly
   - Level 2: Consistently gives reasoning and examples by sharing specific classroom incidents

3. **Uptake of Faculty Feedback in Reflection** (4 marks)
   - Level 1: Reflection shows only surface understanding of prior feedback
   - Level 2: Reflection shows some analysis and thoughtful uptake in some parts
   - Level 3: Reflection shows deep analysis and thoughtful uptake consistently

4. **Openness During Debrief** (3 marks)
   - Level 1: Defensive or walled off during debrief at some points
   - Level 2: Appropriate body language, gestures, tone showing openness to feedback

**GRAND TOTAL: 63 marks maximum (48 from Areas 1-5, 15 from Debrief & Reflection)**

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
- Higher-order thinking even with limited resources
- Questioning techniques that push beyond recall
- Student collaboration and peer learning
- Use of local, low-cost materials for problem-solving activities
- Creative adaptations that foster critical thinking despite constraints

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
        model: 'openai/gpt-4o-mini',
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
    // HOTS COT Rubric: 16 indicators across 5 areas, all scored 1-3, each worth max 3 marks
    const rubric = {
      area1_classroom_management: {
        open_discussions: { max_marks: 3, max_level: 3 },
        resources_organization: { max_marks: 3, max_level: 3 },
        complex_task_expectations: { max_marks: 3, max_level: 3 }
      },
      area2_lesson_planning: {
        objectives_hots_alignment: { max_marks: 3, max_level: 3 },
        analysis_evaluation_strategies: { max_marks: 3, max_level: 3 },
        interdisciplinary_applications: { max_marks: 3, max_level: 3 }
      },
      area3_instructional_strategies: {
        open_ended_questions: { max_marks: 3, max_level: 3 },
        student_analysis_critique: { max_marks: 3, max_level: 3 },
        problem_solving_creativity: { max_marks: 3, max_level: 3 },
        scaffolding: { max_marks: 3, max_level: 3 }
      },
      area4_student_engagement: {
        collaborative_synthesis: { max_marks: 3, max_level: 3 },
        multiple_perspectives: { max_marks: 3, max_level: 3 },
        discussions_debates: { max_marks: 3, max_level: 3 }
      },
      area5_assessment_feedback: {
        self_peer_assessment: { max_marks: 3, max_level: 3 },
        refinement_feedback: { max_marks: 3, max_level: 3 },
        hots_assessment_tasks: { max_marks: 3, max_level: 3 }
      }
    };

    // Compute marks for each area
    const areaTotals = {};
    const areaKeys = Object.keys(rubric);

    for (const areaKey of areaKeys) {
      let areaTotal = 0;
      if (analysis[areaKey]) {
        for (const [key, rubricData] of Object.entries(rubric[areaKey])) {
          if (analysis[areaKey][key]) {
            const competency = analysis[areaKey][key].competency_score;
            const computed = (competency / rubricData.max_level) * rubricData.max_marks;
            analysis[areaKey][key].max_marks = rubricData.max_marks;
            analysis[areaKey][key].computed_marks = parseFloat(computed.toFixed(2));
            areaTotal += computed;
          }
        }
      }
      areaTotals[areaKey + '_total'] = parseFloat(areaTotal.toFixed(2));
    }

    // Add scores summary
    const overall_marks = Object.values(areaTotals).reduce((sum, v) => sum + v, 0);
    const maxClassroomMarks = hasLessonPlan ? CLASSROOM_MARKS_WITH_LP : CLASSROOM_MARKS_BASE;

    analysis.scores = {
      ...areaTotals,
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

TASK: Provide a comprehensive pedagogical analysis in JSON format using the HOTS COT rubric with this EXACT structure:

{
  "executive_summary": "3-5 sentences using SANDWICH METHOD: (1) Start with a genuine strength you observed with a specific example, (2) Identify ONE key growth area with a brief, kind explanation, (3) End with encouragement and a concrete next-step suggestion (e.g., 'Next time, try using think-pair-share during the counting activity to check individual understanding'). CRITICAL: You MUST use the teacher's FIRST NAME (${teacherFirstName || 'the teacher'}) - NEVER use 'Rumi' or 'the teacher'. Tone should be warm, supportive, and coaching-oriented — like a mentor who believes in the teacher's potential.",
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
  "area1_classroom_management": {
    "open_discussions": {
      "competency_score": <1-3>,
      "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote",
      "justification": "Why this score - what was observed",
      "timestamp": "Exact minute mark (e.g., '0:05-0:12' or '5:30-6:45'). MUST be specific time from transcript, NOT 'opening' or 'middle'"
    },
    "resources_organization": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "complex_task_expectations": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" }
  },
  "area2_lesson_planning": {
    "objectives_hots_alignment": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "analysis_evaluation_strategies": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "interdisciplinary_applications": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" }
  },
  "area3_instructional_strategies": {
    "open_ended_questions": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "student_analysis_critique": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "problem_solving_creativity": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "scaffolding": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" }
  },
  "area4_student_engagement": {
    "collaborative_synthesis": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "multiple_perspectives": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "discussions_debates": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" }
  },
  "area5_assessment_feedback": {
    "self_peer_assessment": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "refinement_feedback": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" },
    "hots_assessment_tasks": { "competency_score": <1-3>, "evidence": "RICH coaching paragraph: 6-8 sentences, ~150 words. [timestamp] + vivid observation with student responses + pedagogical insight or growth suggestion + transcript quote", "justification": "...", "timestamp": "exact time" }
  },
  "strengths": [
    {
      "title": "Specific strength title",
      "evidence": "Direct quote or description from transcript WITH timestamp (e.g., '[5:30-6:45] Teacher used...')",
      "analysis": "Why this is pedagogically effective — celebrate what worked",
      "impact": "Positive impact on student learning"
    }
  ],
  "growth_opportunities": [
    {
      "area": "Specific area for development",
      "observation": "What was observed WITH timestamp (e.g., '[12:00-13:30] During the group activity...')",
      "rationale": "Why this matters — frame kindly as an opportunity, not a flaw",
      "strategies": ["Concrete strategy 1", "Concrete strategy 2"],
      "quick_tip": "One practical, immediately actionable sentence the teacher can try tomorrow (e.g., 'Try asking one open-ended question per activity like: What do you think would happen if...?')"
    }
  ],
  "recommendations": [
    "Actionable, practical recommendation the teacher can implement right away — be specific and encouraging",
    "Another concrete suggestion with an example of what to say or do",
    "A third quick win that builds on the teacher's existing strengths"
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
1. For each indicator in Areas 1-5, provide ONLY a competency_score (1, 2, or 3)
2. ALL 16 indicators use the same 3-point scale: 1 (Emerging), 2 (Developing), 3 (Proficient)
3. Marks will be AUTO-COMPUTED using formula: (competency_score / 3) * 3 = competency_score
4. DO NOT calculate raw marks yourself - ONLY provide competency scores 1-3
5. You MUST use the exact JSON keys shown above (area1_classroom_management, area2_lesson_planning, etc.)

EVIDENCE FORMAT — THIS IS THE COACHING FEEDBACK THE TEACHER READS (CRITICAL):
Each indicator's "evidence" field IS the actual feedback paragraph the teacher will read in their PDF report. This is NOT a log — it is personalized coaching. Write it in SECOND PERSON ("You did...") as a supportive mentor talking directly to the teacher.

Think of each evidence field as a mini coaching note — the kind a mentor would write after sitting in the teacher's class. It should feel personal, specific, and helpful. The teacher should read it and think "this person really watched my lesson and understands what I was trying to do."

EVERY evidence field MUST include ALL of the following:

**1. TIMESTAMP + Rich Observation (3-4 sentences):**
Start with [mm:ss-mm:ss] timestamp, then paint a vivid picture of the classroom moment:
- What specific actions you (the teacher) took — describe the activity, method, or technique in detail
- How students responded — what they did, said, how many participated, their energy level, body language cues
- The classroom dynamic — was it lively, quiet, focused, confused? What was the atmosphere?
- Any notable details: materials used, grouping arrangements, how long the activity lasted, transitions

**2. Coaching Insight with Pedagogical Reasoning (2-3 sentences):**
For scores 2-3: Explain WHY what the teacher did was effective using educational reasoning. Connect the teacher's actions to student learning outcomes. Help the teacher understand the deeper pedagogical principle behind their good instinct (e.g., "This works because when students hear a concept in a familiar context, their brains create stronger memory pathways").
For score 1: Start by genuinely celebrating what the teacher DID do well. Then offer ONE practical growth suggestion with a specific example of what to say or do (e.g., "Next time, try asking 'What pattern do you notice?' before revealing the answer — this gives students 10 seconds to think independently").

**3. Direct Quote from Transcript (2-3 sentences of dialogue):**
Format: Quote: "English translation of 2-3 consecutive sentences from the actual classroom dialogue"
Pick a quote that ILLUSTRATES the observation — a meaningful teacher-student exchange, an instruction, or a moment that captures the indicator. ONLY English — no Urdu/Arabic text.

MINIMUM LENGTH: Each evidence field MUST be 6-8 sentences totaling approximately 120-180 words. Evidence shorter than 6 sentences is NOT ACCEPTABLE — go back and add more detail about student responses, pedagogical reasoning, or a richer quote.

**Examples of EXCELLENT evidence (this is the MINIMUM quality for EVERY indicator):**

✅ HIGH SCORE (3): "[4:30-6:00] You organized students into collaborative groups and gave clear, step-by-step instructions for building visual patterns of multiples of six using physical materials. Students were actively engaged throughout — they helped each other arrange the items, discussed strategies within their groups, and several groups independently started extending the pattern beyond what was asked, which showed genuine mathematical curiosity. The classroom was buzzing with productive noise as students debated the best way to represent the multiples visually. This is a powerful example of collaborative learning in action — when students work together to construct understanding rather than passively receiving information, they develop both deeper conceptual knowledge and critical communication skills. The fact that groups went beyond the task shows they felt safe to take intellectual risks in your classroom, which is a sign of a strong learning culture you've built.
Quote: \"Make circles, make taffies, draw the towers as I made them. Work together in your groups. Each person should contribute to the pattern.\""

✅ MEDIUM SCORE (2): "[7:00-8:30] You connected the six-times table to a real shopping scenario involving sweets and rupees, which immediately made the mathematics relevant to students' daily lives — this was a smart instructional move. Several students perked up visibly and began calling out answers enthusiastically, with at least five or six hands going up at once, showing that the real-world context activated both their interest and their prior knowledge of money calculations. The energy in the room shifted noticeably when you introduced this example compared to the abstract counting earlier. This kind of contextual teaching is highly effective because students retain mathematical concepts better when they can anchor them to familiar experiences. To deepen this even further next time, try letting students create their own real-world multiplication problems to share with a partner (e.g., 'If one samosa costs 6 rupees, how much for 4?') — this shifts students from answering your questions to generating their own mathematical thinking, which builds higher-order reasoning.
Quote: \"If a sweet costs 6 rupees and you buy six, how much will it be? Think about it. Who can tell me the answer? Raise your hand if you know.\""

✅ LOW SCORE (1): "[0:00-0:30] You opened the lesson with wonderful energy and enthusiasm, greeting students warmly by name and immediately capturing the whole class's attention — every student was looking at you and ready to learn, which is a genuine strength that not every teacher achieves. Your natural warmth and the positive rapport you have with your students created a welcoming environment where children felt comfortable participating. The lesson launched quickly into counting activities, which kept the momentum going, though it moved past the opening without stating a specific learning goal that students could work toward. One small addition that could make a big difference: try starting with one clear sentence like 'By the end of today, you'll be able to solve real-life problems using the 6-times table.' Research shows that when students know the target, they stay more focused and you can circle back at the end to celebrate what they achieved together — it's a quick win that builds on the strong opening you already have.
Quote: \"Good morning children! Today I will do big things with you. Are you ready? Let's start! Everyone sit up straight and listen.\""

**BAD evidence — if your evidence looks like any of these, REWRITE it with more detail:**
❌ "You asked students to count repeatedly." (TOO SHORT — only 1 sentence, no student response, no coaching insight, no quote)
❌ "No evidence of open-ended questioning." (NEVER say what's missing — describe what the teacher DID do)
❌ "Teacher did not use scaffolding." (WRONG PERSON — use "you", and describe what they DID do with a growth tip)
❌ "Good classroom management was observed." (TOO VAGUE — what specifically did the teacher do? How did students respond?)
❌ Any evidence under 6 sentences (ALWAYS expand — add student responses, pedagogical reasoning, richer quotes)
❌ "You used a variety of strategies." (GENERIC — name the specific strategies, describe each one, show impact)

HANDLING LOW SCORES (score 1) — CRITICAL:
Even for score 1, you MUST provide a FULL, RICH paragraph (6-8 sentences) with the SAME level of detail as high-scoring indicators. NEVER just say what's missing.
Instead: (1) Describe what the teacher DID do in that area with vivid, specific detail and student responses, (2) Genuinely celebrate the effort and what worked, (3) Offer one practical suggestion WITH a specific example of what to say/do in class, (4) Include a meaningful quote from the transcript.

ANALYSIS GUIDELINES:
1. EVERY indicator evidence MUST be a full coaching paragraph (6-8 sentences, 120-180 words) — this IS the teacher's feedback report
2. NEVER write "No evidence" or "Not observed" — always describe what the teacher DID do
3. TONE: You are a warm, experienced mentor who genuinely believes in this teacher's potential. Be specific, encouraging, and insightful
4. Use SECOND PERSON throughout: "You organized..." not "Teacher organized..." or "The lesson included..."
5. For low scores: celebrate effort FIRST, then offer ONE gentle growth suggestion WITH a concrete example (what to say/do)
6. For high scores: explain the pedagogical PRINCIPLE behind why it worked and its impact on student learning
7. Be culturally responsive to Pakistani classroom context and resource constraints
8. Suggestions should be practical things the teacher can try TOMORROW with no extra materials needed
9. In "executive_summary": use FIRST NAME "${teacherFirstName || 'TEACHER_NAME'}", sandwich method (strength → growth → encouragement), include one concrete tip
10. EVERY evidence field MUST start with [mm:ss-mm:ss] timestamp — NON-NEGOTIABLE
11. Each "quick_tip" in growth_opportunities: one practical sentence (e.g., "Try waiting 5 seconds after asking a question before calling on a student")
12. Include VIVID details: what students did/said, how many responded, the classroom energy, what materials were used, how the activity unfolded
13. Connect observations to PEDAGOGICAL PRINCIPLES — help the teacher understand WHY something worked or how a small change could improve learning outcomes`;
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
        model: 'openai/gpt-4o-mini',
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
   * Enhance analysis with teacher reflections (Debrief & Reflection)
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
2. **Add professional reflection analysis** based on the teacher's reflective thinking
3. **Score the DEBRIEF & REFLECTION section** (15 marks) based on the teacher's conversation responses
4. **Preserve all original metrics** (talk_time, questions, scores from Areas 1-5, executive_summary)
5. **Maintain SANDWICH METHOD throughout**: strengths first, then growth areas framed kindly, then encouragement
6. **Preserve timestamps** in all evidence fields — every evidence should start with [mm:ss-mm:ss]
7. **Keep quick_tip fields** in growth_opportunities — practical one-liner suggestions

Return JSON with this EXACT structure:

{
  "executive_summary": "Keep original or slightly enhance if teacher's reflection adds crucial context",
  "talk_time": { ...keep original... },
  "questions": { ...keep original... },
  "area1_classroom_management": { ...keep original... },
  "area2_lesson_planning": { ...keep original... },
  "area3_instructional_strategies": { ...keep original... },
  "area4_student_engagement": { ...keep original... },
  "area5_assessment_feedback": { ...keep original... },
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
      "observation": "Original observation WITH timestamp",
      "rationale": "ENHANCED - may reference teacher's own recognition, framed kindly",
      "strategies": ["Enhanced strategies that align with teacher's reflections"],
      "quick_tip": "One practical sentence the teacher can try immediately"
    }
  ],
  "scores": { ...keep original scores from Areas 1-5... },
  "recommendations": ["ENHANCED recommendations that build on teacher's reflections"],
  "notable_moments": [...keep original...],
  "professional_reflection": {
    "reflection_quality": "Analysis of teacher's reflective responses",
    "self_awareness": "Teacher's awareness of their own practice",
    "growth_orientation": "Evidence of growth mindset",
    "professional_learning_needs": "What teacher identified from their reflections",
    "score": <1-3>,
    "justification": "Brief justification for professional reflection score"
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
- Preserve transcript evidence AND timestamps (don't replace with teacher's reflection)
- Professional reflection score: Base on quality of reflection, self-awareness, and growth mindset
- Debrief & Reflection scoring: Use the rubric criteria from DEBRIEF & REFLECTION SECTION above
- If teacher's reflection contradicts observation, note it diplomatically and kindly
- Recommendations should build on teacher's expressed intentions/concerns
- Use SANDWICH METHOD: lead with what the teacher did well, then growth areas framed as opportunities, then encouragement
- Keep ALL timestamps in evidence — every evidence field should start with [mm:ss-mm:ss]
- Preserve quick_tip in each growth opportunity — a practical one-liner the teacher can try tomorrow`;

      const response = await this.openai.chat.completions.create({
        model: 'openai/gpt-4o-mini',
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
          // Areas 1-5: 48 marks (16 indicators × 3 max each)
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
        hasProfessionalReflection: !!enhancedAnalysis.professional_reflection,
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
        model: 'openai/gpt-4o',  // Using GPT-4o for more reliable question generation
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
        model: 'openai/gpt-4o-mini',
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
        model: 'openai/gpt-4o-mini',
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
        model: 'openai/gpt-4o-mini',
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
        model: 'openai/gpt-4o',  // Using GPT-4o for reliable voice script generation
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
