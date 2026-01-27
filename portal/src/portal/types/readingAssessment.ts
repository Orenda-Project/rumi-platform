// Reading Assessment Types
// Matches backend API response structure

export interface ReadingAssessment {
  id: string;
  studentName: string;
  gradeLevel: number; // 0-5
  language: 'en' | 'ur' | 'ar' | 'es';
  passageType: 'letters' | 'words' | 'sentences' | 'paragraph' | 'story';
  assessmentDate: string; // ISO timestamp
  completedAt: string; // ISO timestamp
  fluency: {
    wcpm: number;
    accuracy: number;
    comprehensionScore: number | null;
    hasComprehension: boolean;
  };
  hasPdfReport: boolean;
  hasVoiceFeedback: boolean;
  reportPdfUrl?: string;
  voiceFeedbackUrl?: string;
}

export interface ReadingAssessmentDetail {
  id: string;
  studentName: string;
  gradeLevel: number;
  language: 'en' | 'ur' | 'ar' | 'es';
  passageType: 'letters' | 'words' | 'sentences' | 'paragraph' | 'story';
  assessmentDate: string;
  completedAt: string;

  passage: {
    text: string;
    imageUrl: string | null;
    wordCount: number;
  };

  audio: {
    url: string | null;
    duration: number | null;
    transcript: string | null;
  };

  fluency: {
    wcpm: number;
    accuracy: number;
    wordsRead: number;
    wordsCorrect: number;
    timeElapsed: number;
    percentileRank: string | null;
    onTrack: boolean | null;
    benchmarkStatus: string;
    errors: Array<{
      type: string;
      word: string;
      position: number;
      timestamp?: number;
    }>;
    selfCorrections: number;
  };

  pronunciation: {
    accuracyScore: number | null;
    fluencyScore: number | null;
    prosodyScore: number | null;
    completenessScore: number | null;
    mispronunciations: Array<{
      word: string;
      expectedPhonemes: string[];
      actualIssue: string;
      guidance: string;
    }>;
  };

  prosody: {
    pacing: string | null;
    expression: string | null;
    fluencyLevel: string | null;
    hesitationCount: number;
    notes: string | null;
  };

  comprehension: {
    requested: boolean;
    score: number;
    questionsAsked: number;
    questionsCorrect: number;
    questions: Array<{
      id: number;
      question: string;
      studentAnswer: string;
      expectedAnswer: string;
      isCorrect: boolean;
    }>;
  } | null;

  diagnosticSummary: string | null;

  outputs: {
    reportPdfUrl: string | null;
    voiceFeedbackUrl: string | null;
    voiceFeedbackDuration: number | null;
  };
}

export interface ReadingStats {
  totalAssessments: number;
  averageWcpm: number;
  averageAccuracy: number;
  studentsAssessed: number;
  mostRecentAssessment: {
    studentName: string;
    date: string;
    wcpm: number;
    accuracy: number;
  } | null;
}
