/**
 * FICO Framework Module
 *
 * FICO Unified Observation Tool
 * 5 Domains, 21 Indicators, Scale 1-4
 * Max: 84 marks (21 × 4)
 *
 * Scale: 1=Not Observed / 2=Emerging / 3=Effective / 4=Highly Effective
 * Photo-aware indicators: 3.2 (Routines & Transitions), 4.4 (Use of Materials)
 *
 * Bead: bd-595 (Phase 1C-A4)
 */

// ─── Domain definitions ──────────────────────────────────────────────

const DOMAINS = {
  lesson_structure: {
    displayName: 'Lesson Structure',
    indicatorCount: 4,
    indicators: [
      { id: '1.1', name: 'Lesson Goal Clarity' },
      { id: '1.2', name: 'Fidelity to LP Steps' },
      { id: '1.3', name: 'Materials Use' },
      { id: '1.4', name: 'Time Management' }
    ]
  },
  instructional_quality: {
    displayName: 'Instructional Quality',
    indicatorCount: 5,
    indicators: [
      { id: '2.1', name: 'Explanation & Modeling' },
      { id: '2.2', name: 'Questioning Technique' },
      { id: '2.3', name: 'Guided Practice' },
      { id: '2.4', name: 'Differentiation' },
      { id: '2.5', name: 'Monitoring Understanding' }
    ]
  },
  classroom_climate: {
    displayName: 'Classroom Climate',
    indicatorCount: 4,
    indicators: [
      { id: '3.1', name: 'Behavioral Climate' },
      { id: '3.2', name: 'Routines & Transitions' },  // Photo-aware
      { id: '3.3', name: 'Respectful Interactions' },
      { id: '3.4', name: 'Safety & Inclusiveness' }
    ]
  },
  student_engagement: {
    displayName: 'Student Engagement',
    indicatorCount: 4,
    indicators: [
      { id: '4.1', name: 'Cognitive Engagement' },
      { id: '4.2', name: 'Participation' },
      { id: '4.3', name: 'Collaboration' },
      { id: '4.4', name: 'Use of Materials' }  // Photo-aware
    ]
  },
  assessment_feedback: {
    displayName: 'Assessment & Feedback',
    indicatorCount: 4,
    indicators: [
      { id: '5.1', name: 'Formative Checks' },
      { id: '5.2', name: 'Quality of Feedback' },
      { id: '5.3', name: 'Accuracy of Marking' },
      { id: '5.4', name: 'Responsive Instruction' }
    ]
  }
};

const TOTAL_INDICATORS = 21; // 4+5+4+4+4
const SCALE_MAX = 4;
const MAX_MARKS = TOTAL_INDICATORS * SCALE_MAX; // 84

// ─── Cached system prompt ────────────────────────────────────────────

let _cachedSystemPrompt = null;

function getSystemPrompt() {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  _cachedSystemPrompt = `You are an expert classroom observer analyzing teaching practices using the FICO Unified Observation Tool.

OBSERVATION FRAMEWORK: FICO Unified Observation Tool
5 Domains, 21 Indicators, Scale 1-4

**SCALE:**
- 1 = Not Observed: Practice absent or not demonstrated
- 2 = Emerging: Minimal, partial demonstration
- 3 = Effective: Consistent, clear demonstration
- 4 = Highly Effective: Expert-level, creative, adaptive

**DOMAIN 1: LESSON STRUCTURE** (4 indicators, max 16)

1.1 **Lesson Goal Clarity** (1-4)
   - 1: Not stated
   - 2: Stated vaguely
   - 3: Clear objective
   - 4: Clear + connected to prior learning

1.2 **Fidelity to LP Steps** (1-4)
   - 1: Skipped
   - 2: Partial
   - 3: Most steps followed
   - 4: All steps with smooth flow

1.3 **Materials Use** (1-4)
   - 1: Not used
   - 2: Used minimally
   - 3: Used effectively
   - 4: Used creatively to deepen learning

1.4 **Time Management** (1-4)
   - 1: Chaotic
   - 2: Some structure
   - 3: Mostly aligned
   - 4: Well-balanced, optimized pacing

**DOMAIN 2: INSTRUCTIONAL QUALITY** (5 indicators, max 20)

2.1 **Explanation & Modeling** (1-4)
   - 1: Confusing
   - 2: Basic
   - 3: Clear
   - 4: Clear + examples & checks

2.2 **Questioning Technique** (1-4)
   - 1: No questioning
   - 2: Low-level recall
   - 3: Mix of questions
   - 4: High-quality + probing

2.3 **Guided Practice** (1-4)
   - 1: No guidance
   - 2: Minimal
   - 3: Effective
   - 4: Adaptive, targeted support

2.4 **Differentiation** (1-4)
   - 1: None
   - 2: Some awareness
   - 3: Attempts adjustments
   - 4: Intentional, flexible

2.5 **Monitoring Understanding** (1-4)
   - 1: Not observed
   - 2: Rare
   - 3: Occasional
   - 4: Continuous and purposeful

**DOMAIN 3: CLASSROOM CLIMATE** (4 indicators, max 16)

3.1 **Behavioral Climate** (1-4)
   - 1: Chaotic
   - 2: Frequent disruptions
   - 3: Mostly on-task
   - 4: Calm, orderly, self-managed

3.2 **Routines & Transitions** (1-4) ⚠️ PHOTO-AWARE
   - 1: Disorganized
   - 2: Slow transitions
   - 3: Smooth
   - 4: Automatic; no lost time
   If classroom photos are provided, use visual evidence for this indicator.

3.3 **Respectful Interactions** (1-4)
   - 1: Negative
   - 2: Neutral
   - 3: Respectful
   - 4: Warm, supportive, inclusive

3.4 **Safety & Inclusiveness** (1-4)
   - 1: Unsafe
   - 2: Some exclusion
   - 3: Safe
   - 4: Emotionally supportive, all included

**DOMAIN 4: STUDENT ENGAGEMENT** (4 indicators, max 16)

4.1 **Cognitive Engagement** (1-4)
   - 1: Passive
   - 2: Limited
   - 3: Engaged
   - 4: Deep thinking, consistent effort

4.2 **Participation** (1-4)
   - 1: Rare
   - 2: Limited
   - 3: Many participate
   - 4: Nearly all at multiple points

4.3 **Collaboration** (1-4)
   - 1: None
   - 2: Random
   - 3: Purposeful
   - 4: Structured, productive

4.4 **Use of Materials** (1-4) ⚠️ PHOTO-AWARE
   - 1: Misuse
   - 2: Basic use
   - 3: Appropriate use
   - 4: Skilled, meaningful use
   If classroom photos are provided, use visual evidence for this indicator.

**DOMAIN 5: ASSESSMENT & FEEDBACK** (4 indicators, max 16)

5.1 **Formative Checks** (1-4)
   - 1: None
   - 2: Minimal
   - 3: Regular
   - 4: Frequent + varied + strategic

5.2 **Quality of Feedback** (1-4)
   - 1: None
   - 2: General
   - 3: Accurate & helpful
   - 4: Genuinely advances learning

5.3 **Accuracy of Marking** (1-4)
   - 1: Inaccurate
   - 2: Partially accurate
   - 3: Mostly accurate
   - 4: Highly accurate + notes misconceptions

5.4 **Responsive Instruction** (1-4)
   - 1: No change
   - 2: Minimal
   - 3: Some adjustments
   - 4: Real-time, responsive

**TOTAL: 84 marks maximum** (21 indicators × 4)

SPECIAL INSTRUCTIONS:
- For Domain 1, indicator 1.2 (Fidelity to LP Steps): If a lesson plan is linked,
  compare observed execution against the specific LP steps.
- For photo-aware indicators (3.2, 4.4): If classroom photos are provided,
  incorporate visual evidence. If no photos, infer from audio cues and note the limitation.
- Provide SPECIFIC transcript evidence for each indicator
- Reference timestamps when quoting dialogue`;

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

  const lpFidelityNote = lessonPlanStructured
    ? `\nIMPORTANT - LP Fidelity: A lesson plan is linked. For indicator 1.2 (Fidelity to LP Steps), compare the planned LP steps against what was observed in the transcript.\n`
    : '';

  const photoNote = photoAnalysis
    ? `\nCLASSROOM PHOTOS: Visual evidence is available. Use it for indicators 3.2 (Routines & Transitions) and 4.4 (Use of Materials).\n`
    : '';

  return `Analyze this classroom transcript using the FICO Unified Observation Tool.

LESSON CONTEXT:
${teacherFirstName ? `- Teacher's First Name: ${teacherFirstName}` : ''}
${grade ? `- Grade: ${grade}` : ''}
${subject ? `- Subject: ${subject}` : ''}
${duration ? `- Duration: ${Math.round(duration / 60)} minutes` : ''}
${language ? `- Primary Language: ${language}` : ''}

${priorFeedback ? `PRIOR FEEDBACK:\n${priorFeedback}\n` : ''}
${lpFidelityNote}${photoNote}
CLASSROOM TRANSCRIPT:
${transcript}

TASK: Score all 21 FICO indicators (1-4 scale) with evidence. Return STRICT JSON:

{
  "executive_summary": "2-3 sentences. Use ${teacherFirstName || 'the teacher'}'s FIRST NAME. Highlight strongest domain and key growth area.",
  "domains": {
    "lesson_structure": {
      "indicators": [
        { "id": "1.1", "name": "Lesson Goal Clarity", "score": <1-4>, "evidence": "Detailed description + Quote: \\"...\\"", "timestamp": "exact time" },
        { "id": "1.2", "name": "Fidelity to LP Steps", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "1.3", "name": "Materials Use", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "1.4", "name": "Time Management", "score": <1-4>, "evidence": "...", "timestamp": "exact time" }
      ],
      "domain_score": <sum>,
      "domain_max": 16
    },
    "instructional_quality": {
      "indicators": [
        { "id": "2.1", "name": "Explanation & Modeling", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "2.2", "name": "Questioning Technique", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "2.3", "name": "Guided Practice", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "2.4", "name": "Differentiation", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "2.5", "name": "Monitoring Understanding", "score": <1-4>, "evidence": "...", "timestamp": "exact time" }
      ],
      "domain_score": <sum>,
      "domain_max": 20
    },
    "classroom_climate": {
      "indicators": [
        { "id": "3.1", "name": "Behavioral Climate", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "3.2", "name": "Routines & Transitions", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "3.3", "name": "Respectful Interactions", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "3.4", "name": "Safety & Inclusiveness", "score": <1-4>, "evidence": "...", "timestamp": "exact time" }
      ],
      "domain_score": <sum>,
      "domain_max": 16
    },
    "student_engagement": {
      "indicators": [
        { "id": "4.1", "name": "Cognitive Engagement", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "4.2", "name": "Participation", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "4.3", "name": "Collaboration", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "4.4", "name": "Use of Materials", "score": <1-4>, "evidence": "...", "timestamp": "exact time" }
      ],
      "domain_score": <sum>,
      "domain_max": 16
    },
    "assessment_feedback": {
      "indicators": [
        { "id": "5.1", "name": "Formative Checks", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "5.2", "name": "Quality of Feedback", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "5.3", "name": "Accuracy of Marking", "score": <1-4>, "evidence": "...", "timestamp": "exact time" },
        { "id": "5.4", "name": "Responsive Instruction", "score": <1-4>, "evidence": "...", "timestamp": "exact time" }
      ],
      "domain_score": <sum>,
      "domain_max": 16
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
- For EACH indicator, describe what the teacher DID (not what they didn't do)
- Include English translation of dialogue: Quote: "..."
- Even for score 1, provide detailed evidence of what was observed
- For photo-aware indicators (3.2, 4.4): note if visual evidence was used or inferred from audio`;
}

// ─── Score computation ───────────────────────────────────────────────

function computeScores(analysis) {
  const domainKeys = Object.keys(DOMAINS);
  let overallMarks = 0;

  for (const domainKey of domainKeys) {
    if (analysis.domains && analysis.domains[domainKey]) {
      const domain = analysis.domains[domainKey];
      let domainScore = 0;

      if (domain.indicators) {
        for (const indicator of domain.indicators) {
          domainScore += indicator.score || 0;
        }
      }

      domain.domain_score = domainScore;
      domain.domain_max = DOMAINS[domainKey].indicatorCount * SCALE_MAX;
      overallMarks += domainScore;
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
    domains: DOMAINS,
    maxMarks: MAX_MARKS,
    scaleMax: SCALE_MAX,
    totalIndicators: TOTAL_INDICATORS
  };
}

// ─── Module exports (standard framework interface) ───────────────────

module.exports = {
  name: 'fico',
  version: '1.0',
  displayName: 'FICO Framework',
  maxMarks: MAX_MARKS,
  hasDebrief: false,
  hasLPBonus: false,

  getSystemPrompt,
  buildAnalysisPrompt,
  computeScores,
  getPerformanceBand,
  getScoringConstants,
};
