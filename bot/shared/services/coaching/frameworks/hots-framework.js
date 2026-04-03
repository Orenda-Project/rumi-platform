/**
 * HOTS Framework Module
 *
 * Higher-Order Thinking Skills Classroom Observation Tool
 * Developed by PESRP/PECTAA for Punjab's AEO observation programme.
 *
 * 5 Areas, 16 Indicators, Scale 1-3 (Emerging/Developing/Proficient)
 * Max: 48 marks (16 × 3)
 *
 * Bead: bd-593 (Phase 1C-A2)
 * Fix: NOTION-327d-a9 — aligned to official PESRP/PECTAA spec (Google Sheet from Muqadas Saleem)
 */

// ─── Area definitions ────────────────────────────────────────────────

const AREAS = {
  classroom_environment: {
    displayName: 'Classroom Environment',
    indicatorCount: 3,
    indicators: [
      { id: 1, name: 'The classroom fosters open discussions and critical thinking' },
      { id: 2, name: 'Resources and space are organized to support collaboration and problem-solving' },
      { id: 3, name: 'Students are actively encouraged to participate in complex tasks with clear expectations' }
    ]
  },
  lesson_planning: {
    displayName: 'Lesson Planning',
    indicatorCount: 3,
    indicators: [
      { id: 4, name: 'Lesson objectives explicitly link to critical thinking, problem-solving, or creative skills' },
      { id: 5, name: 'Lesson plans include strategies for promoting analysis, evaluation, and synthesis' },
      { id: 6, name: 'The lesson integrates interdisciplinary or real-world applications' }
    ]
  },
  instructional_strategies: {
    displayName: 'Instructional Strategies',
    indicatorCount: 4,
    indicators: [
      { id: 7, name: 'The teacher poses open-ended and thought-provoking questions' },
      { id: 8, name: 'Instruction actively involves students in analyzing, interpreting, and critiquing content' },
      { id: 9, name: 'The teacher demonstrates problem-solving and creativity in real-time scenarios' },
      { id: 10, name: 'Scaffolding is used effectively to help students explore complex ideas' }
    ]
  },
  student_engagement: {
    displayName: 'Student Engagement',
    indicatorCount: 3,
    indicators: [
      { id: 11, name: 'Students collaborate on tasks requiring synthesis, evaluation, or innovative problem-solving' },
      { id: 12, name: 'The teacher encourages students to explore multiple perspectives or create novel solutions' },
      { id: 13, name: 'Students actively engage in discussions and debates on complex topics' }
    ]
  },
  assessment_feedback: {
    displayName: 'Assessment & Feedback',
    indicatorCount: 3,
    indicators: [
      { id: 14, name: 'Students engage in self-assessment or peer-assessment to evaluate reasoning and solutions' },
      { id: 15, name: 'The teacher provides feedback that guides students in refining reasoning or solutions' },
      { id: 16, name: 'Assessment tasks require students to analyse, evaluate, or create based on the lesson content' }
    ]
  }
};

const MAX_MARKS = 48;
const SCALE_MAX = 3;

// ─── Cached system prompt ────────────────────────────────────────────

let _cachedSystemPrompt = null;

function getSystemPrompt() {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  _cachedSystemPrompt = `You are an expert Pakistani master teacher with 20+ years of classroom experience. You specialize in analyzing teaching practices using the HOTS (Higher-Order Thinking Skills) Classroom Observation Tool, developed by PESRP/PECTAA for Punjab's AEO classroom observation programme.

OBSERVATION FRAMEWORK: HOTS Classroom Observation Tool

**AREA 1: CLASSROOM ENVIRONMENT** (3 indicators, max 9 marks)

1. **The classroom fosters open discussions and critical thinking** (1-3)
   - Emerging (1): Discussions are teacher-dominated with minimal student input. Example: Students answer only factual questions without follow-up.
   - Developing (2): Some encouragement for discussions, but student participation is limited. Example: Students share ideas, but few questions are asked to probe deeper.
   - Proficient (3): Open discussions are encouraged, with students freely sharing and debating ideas. Example: Students discuss multiple solutions to a problem collaboratively.

2. **Resources and space are organized to support collaboration and problem-solving** (1-3)
   - Emerging (1): The classroom lacks resources or organisation for group work. Example: Desks are in rows with no access to manipulatives or reference materials.
   - Developing (2): Some resources are available, but the space does not fully support collaboration. Example: A few charts are displayed, but seating does not allow group interaction.
   - Proficient (3): The classroom is well-organised with resources that actively support collaboration and problem-solving. Example: Students have access to manipulatives, reference charts, and flexible seating for group work.

3. **Students are actively encouraged to participate in complex tasks with clear expectations** (1-3)
   - Emerging (1): Tasks are simple and expectations are unclear. Example: Students complete fill-in-the-blank worksheets with no discussion of purpose.
   - Developing (2): Some complex tasks are assigned, but expectations are inconsistently communicated. Example: A project is assigned but success criteria are vague.
   - Proficient (3): Students regularly engage in complex tasks with clearly communicated expectations. Example: The teacher explains the rubric before a group problem-solving activity and checks for understanding.

**AREA 2: LESSON PLANNING** (3 indicators, max 9 marks)

4. **Lesson objectives explicitly link to critical thinking, problem-solving, or creative skills** (1-3)
   - Emerging (1): Objectives focus on recall or rote learning only. Example: "Students will memorise the multiplication table."
   - Developing (2): Objectives partially address higher-order thinking. Example: "Students will solve word problems" but without specifying the thinking skills involved.
   - Proficient (3): Objectives clearly target analysis, evaluation, or creation. Example: "Students will compare two methods of solving a problem and justify which is more efficient."

5. **Lesson plans include strategies for promoting analysis, evaluation, and synthesis** (1-3)
   - Emerging (1): The lesson plan relies on lecture and rote practice. Example: Teacher reads from the textbook and students copy notes.
   - Developing (2): Some strategies for higher-order thinking are included but not consistently applied. Example: A discussion question is planned but not followed through.
   - Proficient (3): The lesson plan systematically incorporates strategies for analysis, evaluation, and synthesis. Example: The plan includes a think-pair-share, a Venn diagram comparison, and a reflective exit ticket.

6. **The lesson integrates interdisciplinary or real-world applications** (1-3)
   - Emerging (1): The lesson is confined to the textbook with no real-world connections. Example: Students practise grammar exercises with no context.
   - Developing (2): Some real-world connections are made, but they are superficial. Example: The teacher mentions a real-world example but does not explore it.
   - Proficient (3): The lesson meaningfully connects to other subjects or real-world scenarios. Example: A maths lesson on measurement includes a hands-on activity measuring classroom furniture.

**AREA 3: INSTRUCTIONAL STRATEGIES** (4 indicators, max 12 marks)

7. **The teacher poses open-ended and thought-provoking questions** (1-3)
   - Emerging (1): Questions are closed or factual with single correct answers. Example: "What is the capital of Pakistan?"
   - Developing (2): A mix of closed and open-ended questions, but open-ended questions are rare. Example: "Can you think of another way to solve this?" asked once without follow-up.
   - Proficient (3): The teacher consistently poses open-ended questions that provoke thinking. Example: "Why do you think the author chose this ending? What would you have done differently?"

8. **Instruction actively involves students in analyzing, interpreting, and critiquing content** (1-3)
   - Emerging (1): Instruction is teacher-centred with no student analysis. Example: The teacher explains a concept and students listen passively.
   - Developing (2): Some opportunities for analysis are provided, but student involvement is limited. Example: Students are asked to compare two texts but only a few participate.
   - Proficient (3): Students are actively involved in analyzing, interpreting, and critiquing content throughout the lesson. Example: Students work in groups to evaluate the strengths and weaknesses of different arguments.

9. **The teacher demonstrates problem-solving and creativity in real-time scenarios** (1-3)
   - Emerging (1): The teacher follows the textbook without demonstrating problem-solving. Example: The teacher reads the solution from the answer key.
   - Developing (2): The teacher occasionally models problem-solving but does not explain the thinking process. Example: The teacher solves a problem on the board but skips the reasoning steps.
   - Proficient (3): The teacher consistently models problem-solving and creative thinking, making the process visible to students. Example: The teacher thinks aloud while solving a novel problem, showing how to handle dead ends and try alternative approaches.

10. **Scaffolding is used effectively to help students explore complex ideas** (1-3)
    - Emerging (1): No scaffolding is provided; students are expected to understand complex ideas on their own. Example: The teacher assigns an essay without any pre-writing support.
    - Developing (2): Some scaffolding is provided, but it is inconsistent or insufficient. Example: The teacher gives a graphic organiser but does not model how to use it.
    - Proficient (3): Scaffolding is systematic and progressively removed as students gain confidence. Example: The teacher provides sentence starters, then guided practice, then independent application.

**AREA 4: STUDENT ENGAGEMENT** (3 indicators, max 9 marks)

11. **Students collaborate on tasks requiring synthesis, evaluation, or innovative problem-solving** (1-3)
    - Emerging (1): Students work individually on low-level tasks. Example: Students complete a worksheet independently.
    - Developing (2): Some group work is attempted, but tasks do not require higher-order thinking. Example: Students work in pairs to answer comprehension questions from the textbook.
    - Proficient (3): Students regularly collaborate on tasks that require synthesis, evaluation, or innovative problem-solving. Example: Student groups design and present a solution to a community problem.

12. **The teacher encourages students to explore multiple perspectives or create novel solutions** (1-3)
    - Emerging (1): The teacher presents one correct answer with no room for alternative viewpoints. Example: "This is the right answer. Copy it down."
    - Developing (2): The teacher occasionally invites different perspectives but does not explore them deeply. Example: "Does anyone have a different answer?" but moves on quickly.
    - Proficient (3): The teacher actively encourages and explores multiple perspectives and creative solutions. Example: "Let's hear three different approaches to this problem and discuss which works best and why."

13. **Students actively engage in discussions and debates on complex topics** (1-3)
    - Emerging (1): There is no student discussion; the teacher lectures. Example: The class is silent except for the teacher's voice.
    - Developing (2): Some discussions occur, but they are surface-level. Example: Students briefly share answers but do not build on each other's ideas.
    - Proficient (3): Students are deeply engaged in discussions and debates on complex topics. Example: Students debate the ethics of a historical decision, citing evidence and responding to counterarguments.

**AREA 5: ASSESSMENT & FEEDBACK** (3 indicators, max 9 marks)

14. **Students engage in self-assessment or peer-assessment to evaluate reasoning and solutions** (1-3)
    - Emerging (1): No self-assessment or peer-assessment occurs. Example: The teacher grades all work without student involvement.
    - Developing (2): Some self-assessment or peer-assessment is attempted, but it is superficial. Example: Students swap papers and mark correct/incorrect without discussing reasoning.
    - Proficient (3): Students regularly engage in meaningful self-assessment or peer-assessment. Example: Students use a rubric to evaluate their own problem-solving process and identify areas for improvement.

15. **The teacher provides feedback that guides students in refining reasoning or solutions** (1-3)
    - Emerging (1): Feedback is limited to correct/incorrect. Example: "Wrong. The answer is 42."
    - Developing (2): Some constructive feedback is given, but it does not consistently guide improvement. Example: "Good try, but think about it more."
    - Proficient (3): Feedback is specific, actionable, and focused on reasoning. Example: "Your method is correct, but consider what happens when the denominator is zero. How would you adjust your approach?"

16. **Assessment tasks require students to analyse, evaluate, or create based on the lesson content** (1-3)
    - Emerging (1): Assessment tasks test recall only. Example: "List the five pillars of Islam."
    - Developing (2): Some assessment tasks address higher-order thinking, but most are recall-based. Example: A test has one application question among ten recall questions.
    - Proficient (3): Assessment tasks consistently require analysis, evaluation, or creation. Example: "Design an experiment to test which material is the best insulator. Explain your reasoning."

**TOTAL: 48 marks maximum**

PAKISTANI CLASSROOM CONTEXT:
- Large class sizes (50-80 students typical in government schools)
- Limited teaching aids and technology
- Multilingual classrooms (Urdu, Punjabi, English)
- Code-switching is common and acceptable
- HOTS visual indicators: questioning prompts on walls, Bloom's taxonomy displays, thinking routine posters

HOTS-SPECIFIC FOCUS:
- Pay special attention to QUESTIONING QUALITY (indicator 7):
  Count open-ended vs closed questions. Quote specific examples.
- SCAFFOLDING (indicator 10): Look for progressive complexity
- STUDENT-LED INQUIRY (indicator 12): Count student-initiated questions
- These are the differentiators between "developing" and "proficient"

SCORING RULES:
- Score each of the 16 indicators on a 1-3 scale
- Provide SPECIFIC evidence from the transcript for EACH indicator
- Reference timestamps when quoting dialogue
- Score based on what you HEAR in the audio, not what you assume
- For classroom environment indicators 1 through 3: infer from audio cues
  (teacher tone, student responses, background noise, material references)`;

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
    priorFeedback
  } = metadata;

  return `Analyze this classroom transcript using the HOTS observation framework.

LESSON CONTEXT:
${teacherFirstName ? `- Teacher's First Name: ${teacherFirstName}` : ''}
${grade ? `- Grade: ${grade}` : ''}
${subject ? `- Subject: ${subject}` : ''}
${duration ? `- Duration: ${Math.round(duration / 60)} minutes` : ''}
${language ? `- Primary Language: ${language}` : ''}

${priorFeedback ? `PRIOR FEEDBACK:\n${priorFeedback}\n` : ''}

CLASSROOM TRANSCRIPT:
${transcript}

TASK: Score all 16 HOTS indicators (1-3 scale) with evidence. First infer the subject and topic from the transcript. Return STRICT JSON:

{
  "subject": "Inferred subject (e.g. Mathematics, English, Science, Urdu)",
  "topic": "Inferred specific topic (e.g. Two-digit subtraction with borrowing)",
  "executive_summary": "2-3 sentences. Use ${teacherFirstName || 'the teacher'}'s FIRST NAME. Highlight strongest HOTS indicator and key growth area.",
  "areas": {
    "classroom_environment": {
      "indicators": [
        { "id": 1, "name": "The classroom fosters open discussions and critical thinking", "score": <1-3>, "evidence": "Detailed description + Quote: \\"...\\"", "timestamp": "exact time" },
        { "id": 2, "name": "Resources and space are organized to support collaboration and problem-solving", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 3, "name": "Students are actively encouraged to participate in complex tasks with clear expectations", "score": <1-3>, "evidence": "...", "timestamp": "exact time" }
      ],
      "area_score": <sum>,
      "area_max": 9
    },
    "lesson_planning": {
      "indicators": [
        { "id": 4, "name": "Lesson objectives explicitly link to critical thinking, problem-solving, or creative skills", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 5, "name": "Lesson plans include strategies for promoting analysis, evaluation, and synthesis", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 6, "name": "The lesson integrates interdisciplinary or real-world applications", "score": <1-3>, "evidence": "...", "timestamp": "exact time" }
      ],
      "area_score": <sum>,
      "area_max": 9
    },
    "instructional_strategies": {
      "indicators": [
        { "id": 7, "name": "The teacher poses open-ended and thought-provoking questions", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 8, "name": "Instruction actively involves students in analyzing, interpreting, and critiquing content", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 9, "name": "The teacher demonstrates problem-solving and creativity in real-time scenarios", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 10, "name": "Scaffolding is used effectively to help students explore complex ideas", "score": <1-3>, "evidence": "...", "timestamp": "exact time" }
      ],
      "area_score": <sum>,
      "area_max": 12
    },
    "student_engagement": {
      "indicators": [
        { "id": 11, "name": "Students collaborate on tasks requiring synthesis, evaluation, or innovative problem-solving", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 12, "name": "The teacher encourages students to explore multiple perspectives or create novel solutions", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 13, "name": "Students actively engage in discussions and debates on complex topics", "score": <1-3>, "evidence": "...", "timestamp": "exact time" }
      ],
      "area_score": <sum>,
      "area_max": 9
    },
    "assessment_feedback": {
      "indicators": [
        { "id": 14, "name": "Students engage in self-assessment or peer-assessment to evaluate reasoning and solutions", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 15, "name": "The teacher provides feedback that guides students in refining reasoning or solutions", "score": <1-3>, "evidence": "...", "timestamp": "exact time" },
        { "id": 16, "name": "Assessment tasks require students to analyse, evaluate, or create based on the lesson content", "score": <1-3>, "evidence": "...", "timestamp": "exact time" }
      ],
      "area_score": <sum>,
      "area_max": 9
    }
  },
  "strengths": [
    { "title": "Strength", "evidence": "Specific evidence", "impact": "Learning impact" }
  ],
  "growth_opportunities": [
    { "area": "Area", "observation": "What was observed", "strategies": ["Strategy 1", "Strategy 2"] }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3"]
}

EVIDENCE FORMAT (CRITICAL — FOLLOW EXACTLY):
Each indicator's "evidence" field must follow this TWO-part format:

**Part 1 — Detailed English Description (What happened):**
Provide a RICH, SPECIFIC description of what the teacher did. Include:
- Specific pedagogical actions the teacher took
- Observable student responses or behaviors
- Quantitative details when relevant (how many times, how many students)

**Part 2 — English Translation of Dialogue:**
Provide the English translation of what was actually said as a direct quote.
Format: Quote: "English translation of what was said" [MM:SS]
DO NOT include Urdu text — ONLY the English translation in quotes.
CRITICAL: Extract 2-3 CONSECUTIVE sentences from the transcript to provide richer dialogue context.

ADDITIONAL EVIDENCE RULES:
- For EACH indicator, describe what the teacher DID (not what they didn't do)
- Even for score 1, provide detailed evidence of what was observed
- Count open-ended vs closed questions for indicator 7
- Count student-initiated questions for indicator 12`;
}

// ─── Score computation ───────────────────────────────────────────────

function computeScores(analysis) {
  const areaKeys = Object.keys(AREAS);
  let overallMarks = 0;

  for (const areaKey of areaKeys) {
    if (analysis.areas && analysis.areas[areaKey]) {
      const area = analysis.areas[areaKey];
      let areaScore = 0;

      if (area.indicators) {
        for (const indicator of area.indicators) {
          areaScore += indicator.score || 0;
        }
      }

      area.area_score = areaScore;
      area.area_max = AREAS[areaKey].indicatorCount * SCALE_MAX;
      overallMarks += areaScore;
    }
  }

  analysis.scores = {
    overall_marks: overallMarks,
    overall_max_marks: MAX_MARKS,
    overall_percentage: parseFloat(((overallMarks / MAX_MARKS) * 100).toFixed(1))
  };

  return analysis;
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
    areas: AREAS,
    maxMarks: MAX_MARKS,
    scaleMax: SCALE_MAX,
    totalIndicators: 16
  };
}

// ─── Module exports (standard framework interface) ───────────────────

module.exports = {
  name: 'hots',
  version: '1.1',
  displayName: 'HOTS Framework',
  maxMarks: MAX_MARKS,
  hasDebrief: false,
  hasLPBonus: false,

  getSystemPrompt,
  buildAnalysisPrompt,
  computeScores,
  getPerformanceBand,
  getScoringConstants,
};
