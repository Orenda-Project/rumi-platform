/**
 * OECD Framework Module
 *
 * OECD Framework for High-Quality Teaching (2025) — Adapted for Pakistan
 * Extracted from gpt5-mini.service.js for multi-framework support.
 *
 * 5 Goals, 19 classroom criteria + 4 debrief criteria = 23 total
 * Max: 103 classroom + 14 LP bonus + 15 debrief = 132 max
 *
 * Bead: bd-592 (Phase 1C-A1)
 */

const {
  CLASSROOM_MARKS_BASE,
  CLASSROOM_MARKS_WITH_LP,
  LP_CRITERIA_MARKS
} = require('../../../constants/scoring.constants');

// ─── Rubric definition (single source of truth) ──────────────────────

const RUBRIC = {
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

const DEBRIEF_RUBRIC = {
  reflection_quality: { max_marks: 4, max_level: 2 },
  connecting_to_incidents: { max_marks: 4, max_level: 2 },
  uptake_of_feedback: { max_marks: 4, max_level: 3 },
  openness_during_debrief: { max_marks: 3, max_level: 2 }
};

// ─── Cached system prompt (90% OpenAI caching discount) ──────────────

let _cachedSystemPrompt = null;

function getSystemPrompt() {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  _cachedSystemPrompt = `You are an expert Pakistani master teacher with 20+ years of classroom experience and 10+ years as a mentor teacher. You specialize in analyzing teaching practices using evidence-based pedagogical frameworks.

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

7. **Multi-modality of learning** (5 marks)
   - Level 1: Variety of multimodal inputs/outputs in at least one segment
   - Level 2: Level 1 AND at least one teaching activity is unique and creative

8. **Misconceptions** (4 marks) - optional for certain disciplines
   - Level 1: Awareness of misconceptions without clear remediation strategies
   - Level 2: Misconceptions identified, teacher-led remediation strategies
   - Level 3: Misconceptions identified, student-centered discovery-oriented remediation

**GOAL 3: QUALITY SUBJECT CONTENT** (6 criteria, 30 marks total)

9. **Prior Knowledge** (4 marks)
   - Level 1: Some essential prior knowledge listed, some left out
   - Level 2: All essential prior knowledge listed

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

18. **Classroom Culture** (9 marks)
   - Level 1: Treats most students respectfully, inclusive environment BUT 2 lapses/oversights
   - Level 2: Treats most students respectfully, inclusive environment BUT 1 lapse/oversight
   - Level 3: Treats all students respectfully consistently, fully inclusive environment

19. **Teaching & Learning Materials** (3 marks)
   - Level 1: Some materials missing from Resources column or Appendix
   - Level 2: All materials included in Resources column and Appendix

**TOTAL FROM GOALS 1-5: 103 marks**

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

  return _cachedSystemPrompt;
}

// ─── Analysis prompt builder ─────────────────────────────────────────

function buildAnalysisPrompt(transcript, metadata, lessonPlanStructured, photoAnalysis) {
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
${_formatLessonPlanNarrative(lessonPlanStructured)}

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

HANDLING LOW SCORES:
CRITICAL: Even for competency score 1, you MUST provide DETAILED, RICH evidence of what the teacher DID do (not what they didn't do).

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

// ─── Score computation ───────────────────────────────────────────────

function computeScores(analysis, hasLessonPlan = false) {
  const goalKeys = [
    'goal1_formative_assessment',
    'goal2_student_engagement',
    'goal3_quality_content',
    'goal4_classroom_interaction',
    'goal5_classroom_management'
  ];

  const goalTotals = {};

  for (const goalKey of goalKeys) {
    let goalTotal = 0;
    const goalRubric = RUBRIC[goalKey];

    if (analysis[goalKey] && goalRubric) {
      for (const [criterionKey, rubricData] of Object.entries(goalRubric)) {
        if (analysis[goalKey][criterionKey]) {
          const competency = analysis[goalKey][criterionKey].competency_score;
          const computed = (competency / rubricData.max_level) * rubricData.max_marks;
          const safe = Number.isFinite(computed) ? computed : 0;
          analysis[goalKey][criterionKey].max_marks = rubricData.max_marks;
          analysis[goalKey][criterionKey].computed_marks = parseFloat(safe.toFixed(2));
          goalTotal += safe;
        }
      }
    }

    goalTotals[goalKey] = parseFloat(goalTotal.toFixed(2));
  }

  const overall_marks = Object.values(goalTotals).reduce((sum, t) => sum + t, 0);
  const maxClassroomMarks = hasLessonPlan ? CLASSROOM_MARKS_WITH_LP : CLASSROOM_MARKS_BASE;

  analysis.scores = {
    goal1_total: goalTotals.goal1_formative_assessment,
    goal2_total: goalTotals.goal2_student_engagement,
    goal3_total: goalTotals.goal3_quality_content,
    goal4_total: goalTotals.goal4_classroom_interaction,
    goal5_total: goalTotals.goal5_classroom_management,
    overall_marks: parseFloat(overall_marks.toFixed(2)),
    max_marks: maxClassroomMarks,
    percentage: parseFloat(((overall_marks / maxClassroomMarks) * 100).toFixed(1)),
    has_lesson_plan: hasLessonPlan
  };

  return analysis;
}

// ─── Debrief marks ───────────────────────────────────────────────────

function computeDebriefMarks(debriefData) {
  if (!debriefData) return null;

  let debrief_total = 0;

  for (const [key, rubricData] of Object.entries(DEBRIEF_RUBRIC)) {
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

// ─── Performance bands ───────────────────────────────────────────────

function getPerformanceBand(percentage) {
  if (percentage >= 80) return 'excellent';
  if (percentage >= 60) return 'proficient';
  if (percentage >= 40) return 'developing';
  return 'emerging';
}

// ─── Scoring constants accessor ──────────────────────────────────────

function getScoringConstants() {
  return {
    areas: RUBRIC,
    debrief: DEBRIEF_RUBRIC,
    maxMarks: CLASSROOM_MARKS_BASE,
    maxMarksWithLP: CLASSROOM_MARKS_WITH_LP,
    lpBonus: LP_CRITERIA_MARKS,
    debriefMax: 15
  };
}

// ─── Lesson plan narrative formatter (shared utility) ────────────────

function _formatLessonPlanNarrative(lessonPlanStructured) {
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

// ─── Module exports (standard framework interface) ───────────────────

module.exports = {
  name: 'oecd',
  version: '1.0',
  displayName: 'OECD Framework',
  maxMarks: CLASSROOM_MARKS_BASE, // 103
  hasDebrief: true,
  hasLPBonus: true,

  getSystemPrompt,
  buildAnalysisPrompt,
  computeScores,
  computeDebriefMarks,
  getPerformanceBand,
  getScoringConstants,

  // Exposed for GPT5MiniService backward compat during transition
  _formatLessonPlanNarrative,
};
