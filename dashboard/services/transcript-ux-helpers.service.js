/**
 * Transcript UX Helper Functions
 * Bead: etv-ux01 (Phase 7)
 *
 * Helper functions for displaying SLO Mastery and Classroom Climate
 * data in a user-friendly format with traffic light indicators.
 *
 * Created: January 18, 2026
 */

/**
 * Mastery Status Mapping
 * Converts raw confidence + evidence count into user-friendly status
 *
 * @param {string} confidence - 'high', 'medium', 'low', or null
 * @param {number} evidenceCount - Number of student evidence items
 * @param {boolean} addressed - Whether objective was taught
 * @returns {Object} { status, icon, cssClass, message, suggestion }
 */
function getMasteryStatus(confidence, evidenceCount = 0, addressed = true) {
  // Not addressed case
  if (!addressed) {
    return {
      status: 'NOT_ADDRESSED',
      icon: '⬜',
      cssClass: 'mastery-not-addressed',
      message: 'This objective was not covered in the lesson',
      suggestion: 'Consider addressing this objective in a future lesson.'
    };
  }

  const confidenceLower = (confidence || '').toLowerCase();

  // HIGH confidence with good evidence
  if (confidenceLower === 'high' && evidenceCount >= 2) {
    return {
      status: 'ACHIEVED',
      icon: '🟢',
      cssClass: 'mastery-achieved',
      message: 'Students demonstrated understanding',
      suggestion: null
    };
  }

  // HIGH confidence but limited evidence
  if (confidenceLower === 'high' && evidenceCount < 2) {
    return {
      status: 'LIKELY_ACHIEVED',
      icon: '🟢',
      cssClass: 'mastery-achieved',
      message: 'Strong evidence of understanding',
      suggestion: null
    };
  }

  // MEDIUM confidence
  if (confidenceLower === 'medium') {
    return {
      status: 'NEEDS_EVIDENCE',
      icon: '🟡',
      cssClass: 'mastery-needs-evidence',
      message: evidenceCount > 0
        ? `${evidenceCount} student response${evidenceCount > 1 ? 's' : ''} found, but not conclusive`
        : 'Some evidence detected, but more assessment recommended',
      suggestion: 'Ask follow-up questions in the next lesson to confirm understanding.'
    };
  }

  // LOW confidence or no evidence
  if (confidenceLower === 'low' || evidenceCount === 0) {
    return {
      status: 'NOT_ASSESSED',
      icon: '🔴',
      cssClass: 'mastery-not-assessed',
      message: 'Limited or no evidence of student understanding',
      suggestion: 'Consider adding a quick formative assessment activity.'
    };
  }

  // Default fallback
  return {
    status: 'UNKNOWN',
    icon: '⬜',
    cssClass: 'mastery-unknown',
    message: 'Unable to determine mastery level',
    suggestion: null
  };
}

/**
 * Climate Status for Emotional Support
 *
 * @param {Object} metrics - { praise_count, named_praise_count, negative_language_count, etc. }
 * @param {number} durationMinutes - Session duration in minutes (for rate calculation)
 * @returns {Object} { status, icon, cssClass, highlights, concerns }
 */
function getEmotionalSupportStatus(metrics, durationMinutes = 30) {
  if (!metrics) {
    return {
      status: 'NO_DATA',
      icon: '⬜',
      cssClass: 'climate-no-data',
      highlights: [],
      concerns: []
    };
  }

  const praiseCount = metrics.praise_count || 0;
  const namedPraiseCount = metrics.named_praise_count || 0;
  const encouragementCount = metrics.encouragement_count || 0;
  const negativeLangCount = metrics.negative_language_count || 0;
  const studentPerspectiveQuestions = metrics.student_perspective_questions || 0;

  // Calculate benchmarks (per 30 minutes)
  const normalizedDuration = Math.max(durationMinutes, 1) / 30;
  const praiseRate = praiseCount / normalizedDuration;

  const highlights = [];
  const concerns = [];

  // Praise analysis
  if (praiseRate >= 10) {
    highlights.push(`${praiseCount} praise instances (excellent, above average)`);
  } else if (praiseRate >= 5) {
    highlights.push(`${praiseCount} praise instances (good)`);
  } else if (praiseRate >= 3) {
    highlights.push(`${praiseCount} praise instances`);
  } else {
    concerns.push(`Only ${praiseCount} praise instances (consider more positive reinforcement)`);
  }

  // Named praise
  if (namedPraiseCount > 0) {
    highlights.push(`${namedPraiseCount} student${namedPraiseCount > 1 ? 's' : ''} praised by name`);
  }

  // Encouragement
  if (encouragementCount > 0) {
    highlights.push(`${encouragementCount} encouragement instance${encouragementCount > 1 ? 's' : ''}`);
  }

  // Negative language
  if (negativeLangCount === 0) {
    highlights.push('No negative language detected');
  } else if (negativeLangCount <= 2) {
    concerns.push(`${negativeLangCount} instance${negativeLangCount > 1 ? 's' : ''} of potentially negative language`);
  } else {
    concerns.push(`${negativeLangCount} instances of negative language (consider softer redirection strategies)`);
  }

  // Student perspective
  if (studentPerspectiveQuestions >= 3) {
    highlights.push(`${studentPerspectiveQuestions} questions asking for student opinions`);
  }

  // Determine overall status
  let status, icon, cssClass;

  if (negativeLangCount > 3) {
    status = 'CONCERNING';
    icon = '🔴';
    cssClass = 'climate-concerning';
  } else if (praiseRate >= 5 && negativeLangCount <= 1) {
    status = 'POSITIVE';
    icon = '🟢';
    cssClass = 'climate-positive';
  } else if (praiseRate >= 3 || negativeLangCount <= 2) {
    status = 'GOOD';
    icon = '🟡';
    cssClass = 'climate-good';
  } else {
    status = 'NEEDS_IMPROVEMENT';
    icon = '🟡';
    cssClass = 'climate-needs-improvement';
  }

  return { status, icon, cssClass, highlights, concerns };
}

/**
 * Climate Status for Instructional Support
 *
 * @param {Object} metrics - { press_for_reasoning, higher_order_questions, scaffolding_instances, etc. }
 * @param {number} durationMinutes - Session duration in minutes
 * @returns {Object} { status, icon, cssClass, highlights, concerns }
 */
function getInstructionalSupportStatus(metrics, durationMinutes = 30) {
  if (!metrics) {
    return {
      status: 'NO_DATA',
      icon: '⬜',
      cssClass: 'climate-no-data',
      highlights: [],
      concerns: []
    };
  }

  const pressForReasoning = metrics.press_for_reasoning || 0;
  const higherOrderQuestions = metrics.higher_order_questions || 0;
  const connectionStatements = metrics.connection_statements || 0;
  const specificFeedbackCount = metrics.specific_feedback_count || 0;
  const scaffoldingInstances = metrics.scaffolding_instances || 0;

  const highlights = [];
  const concerns = [];

  // Press for reasoning ("why" questions)
  if (pressForReasoning >= 5) {
    highlights.push(`${pressForReasoning} "why" questions (encourages deeper thinking)`);
  } else if (pressForReasoning >= 2) {
    highlights.push(`${pressForReasoning} "why" question${pressForReasoning > 1 ? 's' : ''}`);
  } else {
    concerns.push('Few "why" or "explain" questions (consider probing student reasoning)');
  }

  // Higher-order questions
  if (higherOrderQuestions >= 3) {
    highlights.push(`${higherOrderQuestions} higher-order questions (compare, analyze, evaluate)`);
  } else if (higherOrderQuestions > 0) {
    highlights.push(`${higherOrderQuestions} higher-order question${higherOrderQuestions > 1 ? 's' : ''}`);
  }

  // Scaffolding
  if (scaffoldingInstances >= 3) {
    highlights.push(`${scaffoldingInstances} scaffolding instances (supporting student learning)`);
  } else if (scaffoldingInstances > 0) {
    highlights.push(`${scaffoldingInstances} scaffolding instance${scaffoldingInstances > 1 ? 's' : ''}`);
  }

  // Connection statements
  if (connectionStatements >= 2) {
    highlights.push(`${connectionStatements} connections to prior knowledge`);
  }

  // Specific feedback
  if (specificFeedbackCount >= 5) {
    highlights.push(`${specificFeedbackCount} specific feedback comments`);
  } else if (specificFeedbackCount > 0) {
    highlights.push(`${specificFeedbackCount} specific feedback instance${specificFeedbackCount > 1 ? 's' : ''}`);
  }

  // Determine overall status
  let status, icon, cssClass;
  const totalQualityIndicators = pressForReasoning + higherOrderQuestions + scaffoldingInstances;

  if (totalQualityIndicators >= 10) {
    status = 'EXCELLENT';
    icon = '🟢';
    cssClass = 'climate-positive';
  } else if (totalQualityIndicators >= 5) {
    status = 'GOOD';
    icon = '🟢';
    cssClass = 'climate-positive';
  } else if (totalQualityIndicators >= 2) {
    status = 'ROOM_TO_GROW';
    icon = '🟡';
    cssClass = 'climate-good';
  } else {
    status = 'NEEDS_IMPROVEMENT';
    icon = '🟡';
    cssClass = 'climate-needs-improvement';
  }

  return { status, icon, cssClass, highlights, concerns };
}

/**
 * Climate Status for Classroom Organization
 *
 * @param {Object} metrics - { transition_cues, redirection_count }
 * @returns {Object} { status, icon, cssClass, highlights, concerns }
 */
function getClassroomOrganizationStatus(metrics) {
  if (!metrics) {
    return {
      status: 'NO_DATA',
      icon: '⬜',
      cssClass: 'climate-no-data',
      highlights: [],
      concerns: [],
      note: 'This metric has lower confidence without video observation.'
    };
  }

  const transitionCues = metrics.transition_cues || 0;
  const redirectionCount = metrics.redirection_count || 0;

  const highlights = [];
  const concerns = [];

  if (transitionCues > 0) {
    highlights.push(`${transitionCues} clear transition cue${transitionCues > 1 ? 's' : ''}`);
  }

  if (redirectionCount === 0) {
    highlights.push('No behavior redirections needed');
  } else if (redirectionCount <= 3) {
    highlights.push(`${redirectionCount} redirection${redirectionCount > 1 ? 's' : ''} (minimal)`);
  } else {
    concerns.push(`${redirectionCount} redirections (consider proactive classroom management strategies)`);
  }

  // Determine overall status
  let status, icon, cssClass;

  if (redirectionCount === 0 && transitionCues > 0) {
    status = 'WELL_ORGANIZED';
    icon = '🟢';
    cssClass = 'climate-positive';
  } else if (redirectionCount <= 3) {
    status = 'GOOD';
    icon = '🟡';
    cssClass = 'climate-good';
  } else {
    status = 'NEEDS_ATTENTION';
    icon = '🟡';
    cssClass = 'climate-needs-improvement';
  }

  return {
    status,
    icon,
    cssClass,
    highlights,
    concerns,
    note: 'This metric has lower confidence without video observation.'
  };
}

/**
 * Format student evidence for display
 * Handles both string and object evidence formats
 *
 * @param {Array} evidence - Array of evidence items (strings or objects)
 * @returns {Array} Formatted evidence array with { quote, speaker, timestamp }
 */
function formatStudentEvidence(evidence) {
  if (!evidence || !Array.isArray(evidence) || evidence.length === 0) {
    return [];
  }

  return evidence.map((item, index) => {
    if (typeof item === 'string') {
      return {
        quote: item,
        speaker: null,
        timestamp: null
      };
    }

    if (typeof item === 'object') {
      return {
        quote: item.quote || item.utterance || item.text || JSON.stringify(item),
        speaker: item.speaker || null,
        timestamp: item.timestamp || item.timestamp_ms ? formatTimestamp(item.timestamp_ms) : null
      };
    }

    return {
      quote: String(item),
      speaker: null,
      timestamp: null
    };
  });
}

/**
 * Format milliseconds to MM:SS timestamp
 *
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(ms) {
  if (!ms || isNaN(ms)) return null;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get overall SLO coverage summary
 *
 * @param {Array} objectives - Array of objectives from slo_mastery
 * @returns {Object} { total, addressed, achieved, percentage, progressBar }
 */
function getSLOCoverageSummary(objectives) {
  if (!objectives || !Array.isArray(objectives) || objectives.length === 0) {
    return {
      total: 0,
      addressed: 0,
      achieved: 0,
      percentage: 0,
      progressBar: ''
    };
  }

  const total = objectives.length;
  let addressed = 0;
  let achieved = 0;

  objectives.forEach(obj => {
    if (obj.addressed !== false) {
      addressed++;
    }

    const status = getMasteryStatus(
      obj.mastery_confidence,
      (obj.student_evidence || []).length,
      obj.addressed !== false
    );

    if (status.status === 'ACHIEVED' || status.status === 'LIKELY_ACHIEVED') {
      achieved++;
    }
  });

  const percentage = Math.round((addressed / total) * 100);

  // Create a 10-character progress bar
  const filled = Math.round(percentage / 10);
  const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  return { total, addressed, achieved, percentage, progressBar };
}

/**
 * Get human-readable status label
 *
 * @param {string} status - Status code from getMasteryStatus
 * @returns {string} Human-readable label
 */
function getStatusLabel(status) {
  const labels = {
    'ACHIEVED': 'Likely Achieved',
    'LIKELY_ACHIEVED': 'Likely Achieved',
    'NEEDS_EVIDENCE': 'Needs More Evidence',
    'NOT_ASSESSED': 'Not Assessed',
    'NOT_ADDRESSED': 'Not Addressed',
    'UNKNOWN': 'Unknown',
    'POSITIVE': 'Positive Environment',
    'GOOD': 'Good',
    'CONCERNING': 'Needs Attention',
    'NEEDS_IMPROVEMENT': 'Room to Grow',
    'EXCELLENT': 'Excellent',
    'ROOM_TO_GROW': 'Good, Room to Grow',
    'WELL_ORGANIZED': 'Well Organized',
    'NEEDS_ATTENTION': 'Needs Attention',
    'NO_DATA': 'No Data'
  };

  return labels[status] || status;
}

module.exports = {
  getMasteryStatus,
  getEmotionalSupportStatus,
  getInstructionalSupportStatus,
  getClassroomOrganizationStatus,
  formatStudentEvidence,
  formatTimestamp,
  getSLOCoverageSummary,
  getStatusLabel
};
