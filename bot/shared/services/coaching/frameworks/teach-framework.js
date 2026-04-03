/**
 * Teach Framework Module
 *
 * World Bank Teach Primary Observation Tool (2019)
 * 3 Areas, 9 Elements, 28 Behaviors + Time on Task
 * Element scoring: holistic 1-5 (not mathematical average)
 * Max: 50 (9 elements + 1 time_on_task × 5)
 *
 * Bead: bd-594 (Phase 1C-A3)
 */

// ─── Area definitions ────────────────────────────────────────────────

const AREAS = {
  classroom_culture: {
    displayName: 'Classroom Culture',
    elementCount: 2,
    elements: [
      { id: 1, name: 'Supportive Learning Environment', behaviors: ['Treats all respectfully', 'Positive language', 'Responds to needs', 'No bias'] },
      { id: 2, name: 'Positive Behavioral Expectations', behaviors: ['Clear expectations', 'Acknowledges positive behavior', 'Redirects misbehavior'] }
    ]
  },
  instruction: {
    displayName: 'Instruction',
    elementCount: 4,
    elements: [
      { id: 3, name: 'Lesson Facilitation', behaviors: ['Articulates objectives', 'Multiple representations', 'Connections', 'Models thinking'] },
      { id: 4, name: 'Checks for Understanding', behaviors: ['Questions/prompts', 'Monitors during work', 'Adjusts teaching'] },
      { id: 5, name: 'Feedback', behaviors: ['Clarifies misunderstandings', 'Identifies successes'] },
      { id: 6, name: 'Critical Thinking', behaviors: ['Open-ended questions', 'Thinking tasks', 'Student-initiated analysis'] }
    ]
  },
  socioemotional: {
    displayName: 'Socioemotional Skills',
    elementCount: 3,
    elements: [
      { id: 7, name: 'Autonomy', behaviors: ['Student choices', 'Meaningful roles', 'Volunteering'] },
      { id: 8, name: 'Perseverance', behaviors: ['Acknowledges effort', 'Positive attitude', 'Goal setting'] },
      { id: 9, name: 'Social & Collaborative', behaviors: ['Peer interaction', 'Interpersonal skills', 'Student collaboration'] }
    ]
  }
};

const MAX_MARKS = 50; // 9 elements + 1 time_on_task, each 1-5
const ELEMENT_MAX = 5;

// ─── Cached system prompt ────────────────────────────────────────────

let _cachedSystemPrompt = null;

function getSystemPrompt() {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  _cachedSystemPrompt = `You are an expert classroom observer analyzing teaching practices using the World Bank's Teach observation tool.

OBSERVATION FRAMEWORK: Teach Primary Observation Tool
Reference: Teach Primary Observer Manual (World Bank, 2019)

This tool has TWO components:

**COMPONENT 1: TIME ON TASK** (1 score, max 5)
Estimate the proportion of students who are on task (engaged in learning activity).
Infer from audio cues: student engagement sounds, off-task chatter, teacher redirections.
Score 1-5 based on estimated on-task percentage.

**COMPONENT 2: QUALITY OF TEACHING** (3 Areas, 9 Elements)

**AREA 1: CLASSROOM CULTURE** (2 elements)

Element 1: **Supportive Learning Environment** (holistic 1-5)
Key Behaviors:
- Teacher treats all students respectfully
- Uses positive language consistently
- Responds to students' needs and emotions
- No bias or discrimination observed

Element 2: **Positive Behavioral Expectations** (holistic 1-5)
Key Behaviors:
- Sets and communicates clear behavioral expectations
- Acknowledges and reinforces positive behavior
- Redirects misbehavior effectively and respectfully

**AREA 2: INSTRUCTION** (4 elements)

Element 3: **Lesson Facilitation** (holistic 1-5)
Key Behaviors:
- Explicitly articulates lesson objectives
- Uses multiple representations/examples
- Makes connections to prior knowledge and real world
- Models thinking processes aloud

Element 4: **Checks for Understanding** (holistic 1-5)
Key Behaviors:
- Uses questions/prompts to gauge understanding
- Monitors student work during activities
- Adjusts teaching based on student responses

Element 5: **Feedback** (holistic 1-5)
Key Behaviors:
- Clarifies misunderstandings with explanations
- Identifies and acknowledges student successes

Element 6: **Critical Thinking** (holistic 1-5)
Key Behaviors:
- Asks open-ended questions requiring analysis
- Provides thinking tasks beyond recall
- Encourages student-initiated analysis and reasoning

**AREA 3: SOCIOEMOTIONAL SKILLS** (3 elements)

Element 7: **Autonomy** (holistic 1-5)
Key Behaviors:
- Provides opportunities for student choice
- Assigns meaningful roles to students
- Encourages volunteering and initiative

Element 8: **Perseverance** (holistic 1-5)
Key Behaviors:
- Acknowledges effort, not just results
- Models positive attitude toward challenges
- Supports goal setting and self-monitoring

Element 9: **Social & Collaborative Skills** (holistic 1-5)
Key Behaviors:
- Facilitates meaningful peer interaction
- Teaches interpersonal skills explicitly
- Structures student collaboration activities

**TOTAL: 50 marks maximum** (10 scores × 5 each)

SCORING PROTOCOL:
1. For each of the 28 behaviors, assign L (Low), M (Medium), or H (High)
2. Then assign a holistic 1-5 score per element:
   - Consider ALL behavior ratings for that element
   - Re-read the element description
   - The score reflects overall quality, not a mathematical average
   - 1 = No evidence of the element
   - 2 = Minimal evidence (mostly Low behaviors)
   - 3 = Mixed evidence (some Medium, some Low)
   - 4 = Good evidence (mostly Medium/High)
   - 5 = Strong evidence (mostly High behaviors)
3. Time on Task: Infer from audio cues. Assign 1-5.

CRITICAL: This is a HOLISTIC scoring tool. Quote from manual: "The final score need not be a mathematical calculation and should reflect the evidence."

NOTE: Teach was designed for two 15-minute live observations. You are analyzing a single audio recording. Acknowledge this adaptation in your analysis.

PAKISTANI CLASSROOM CONTEXT:
- Large class sizes (50-80 students typical)
- Multilingual classrooms (Urdu, English, regional languages)
- Code-switching is common and acceptable
- Limited resources but creative use of available materials`;

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

  return `Analyze this classroom transcript using the World Bank Teach observation framework.

LESSON CONTEXT:
${teacherFirstName ? `- Teacher's First Name: ${teacherFirstName}` : ''}
${grade ? `- Grade: ${grade}` : ''}
${subject ? `- Subject: ${subject}` : ''}
${duration ? `- Duration: ${Math.round(duration / 60)} minutes` : ''}
${language ? `- Primary Language: ${language}` : ''}

${priorFeedback ? `PRIOR FEEDBACK:\n${priorFeedback}\n` : ''}

CLASSROOM TRANSCRIPT:
${transcript}

TASK: Score all 9 elements (holistic 1-5) plus Time on Task. For each element, rate behaviors as L/M/H first. Return STRICT JSON:

{
  "executive_summary": "2-3 sentences. Use ${teacherFirstName || 'the teacher'}'s FIRST NAME. Highlight strongest element and key growth area.",
  "time_on_task": {
    "score": <1-5>,
    "evidence": "Description of on-task vs off-task cues from audio"
  },
  "areas": {
    "classroom_culture": {
      "elements": [
        {
          "id": 1, "name": "Supportive Learning Environment",
          "holistic_score": <1-5>,
          "behaviors": [
            { "id": "1.1", "name": "Treats all respectfully", "rating": "<L|M|H>", "evidence": "..." },
            { "id": "1.2", "name": "Positive language", "rating": "<L|M|H>", "evidence": "..." },
            { "id": "1.3", "name": "Responds to needs", "rating": "<L|M|H>", "evidence": "..." },
            { "id": "1.4", "name": "No bias", "rating": "<L|M|H>", "evidence": "..." }
          ]
        },
        {
          "id": 2, "name": "Positive Behavioral Expectations",
          "holistic_score": <1-5>,
          "behaviors": [
            { "id": "2.1", "name": "Clear expectations", "rating": "<L|M|H>", "evidence": "..." },
            { "id": "2.2", "name": "Acknowledges positive behavior", "rating": "<L|M|H>", "evidence": "..." },
            { "id": "2.3", "name": "Redirects misbehavior", "rating": "<L|M|H>", "evidence": "..." }
          ]
        }
      ],
      "area_score": <sum of holistic scores>,
      "area_max": 10
    },
    "instruction": {
      "elements": [
        { "id": 3, "name": "Lesson Facilitation", "holistic_score": <1-5>, "behaviors": [...] },
        { "id": 4, "name": "Checks for Understanding", "holistic_score": <1-5>, "behaviors": [...] },
        { "id": 5, "name": "Feedback", "holistic_score": <1-5>, "behaviors": [...] },
        { "id": 6, "name": "Critical Thinking", "holistic_score": <1-5>, "behaviors": [...] }
      ],
      "area_score": <sum>,
      "area_max": 20
    },
    "socioemotional": {
      "elements": [
        { "id": 7, "name": "Autonomy", "holistic_score": <1-5>, "behaviors": [...] },
        { "id": 8, "name": "Perseverance", "holistic_score": <1-5>, "behaviors": [...] },
        { "id": 9, "name": "Social & Collaborative", "holistic_score": <1-5>, "behaviors": [...] }
      ],
      "area_score": <sum>,
      "area_max": 15
    }
  },
  "strengths": [
    { "title": "Strength", "evidence": "Specific evidence + Quote: \\"...\\"", "impact": "Learning impact" }
  ],
  "growth_opportunities": [
    { "area": "Area", "observation": "What was observed", "strategies": ["Strategy 1", "Strategy 2"] }
  ],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2", "Actionable recommendation 3"]
}

EVIDENCE RULES:
- Rate EACH behavior as L (Low), M (Medium), or H (High) with evidence
- Then assign holistic 1-5 per element (not a mathematical average of L/M/H)
- Include English translation of dialogue: Quote: "..."
- Even for low-scoring elements, describe what WAS observed`;
}

// ─── Score computation ───────────────────────────────────────────────

function computeScores(analysis) {
  const areaKeys = Object.keys(AREAS);
  let overallMarks = 0;

  // Time on Task
  const totScore = analysis.time_on_task?.score || 0;
  overallMarks += totScore;

  // Element scores per area
  for (const areaKey of areaKeys) {
    if (analysis.areas && analysis.areas[areaKey]) {
      const area = analysis.areas[areaKey];
      let areaScore = 0;

      if (area.elements) {
        for (const element of area.elements) {
          areaScore += element.holistic_score || 0;
        }
      }

      area.area_score = areaScore;
      area.area_max = AREAS[areaKey].elementCount * ELEMENT_MAX;
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
    elementMax: ELEMENT_MAX,
    totalElements: 9,
    hasTimeOnTask: true
  };
}

// ─── Module exports (standard framework interface) ───────────────────

module.exports = {
  name: 'teach',
  version: '1.0',
  displayName: 'Teach Framework',
  maxMarks: MAX_MARKS,
  hasDebrief: false,
  hasLPBonus: false,

  getSystemPrompt,
  buildAnalysisPrompt,
  computeScores,
  getPerformanceBand,
  getScoringConstants,
};
