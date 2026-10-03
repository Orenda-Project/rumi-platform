export interface User {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  /** In the observe role family: shows the coach's "Observations" area. */
  isCoach?: boolean;
}

export interface DashboardStats {
  totalLessonPlans: number;
  totalCoachingSessions: number;
}

export interface LessonPlan {
  id: string;
  title: string;
  subject?: string;
  grade_level?: string;
  content_type: 'lesson_plan' | 'presentation';
  gamma_url?: string;
  pdf_url?: string;
  created_at: string;
}

export interface CoachingSession {
  id: string;
  date: string;
  duration: number;
  overallScore: number;
  maxScore: number;
  percentage: number;
}

export interface GoalScore {
  goal: string;
  points: number;
  max_points: number;
  percentage: number;
}

export interface CriterionScore {
  criterion: string;
  points: number;
  max_points: number;
  percentage: number;
}

export interface AnalysisData {
  overall_score: {
    points: number;
    max_points: number;
    percentage: number;
  };
  goal_scores: GoalScore[];
  criterion_scores: CriterionScore[];
  strengths: string[];
  growth_opportunities: string[];
  recommendations: string[];
}

export interface SessionDetail extends CoachingSession {
  audioUrl?: string;
  transcript?: string;
  analysisData: AnalysisData;
  reportPdfUrl?: string;
}

export interface ScoreTrend {
  date: string;
  score: number;
  percentage: number;
}

export interface GoalBreakdown {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
}

export interface AnalyticsInsights {
  totalSessions: number;
  averageScore: number;
  improvement: number;
  bestGoalArea: string;
  focusArea: string;
}

export interface CoachingAnalytics {
  overallScoreTrend: ScoreTrend[];
  goalAreaBreakdown: GoalBreakdown[];
  insights: AnalyticsInsights;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  error?: string;
  data?: T;
}

// Issue #7: Video Library Types
export interface VideoRequest {
  id: string;
  topic: string;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  pdf_url?: string;
  slide_urls?: string[];
  thumbnailUrl?: string; // Presigned URL from backend
  generation_time_seconds?: number;
  created_at: string;
  completed_at?: string;
}

export interface VideoSlide {
  slideId: number;
  title: string;
  narration: string;
  startUrl?: string;
  endUrl?: string;
}

export interface VideoDetail extends VideoRequest {
  script_data?: {
    slides: VideoSlide[];
    audioDurations: number[];
  };
  slide_urls?: string[];
  thumbnailUrl?: string; // Presigned URL from backend
  current_step?: number;
  error_message?: string;
}

// Coach's view ("My observations"). No scores and no coach-the-coach feedback
// are ever sent to the portal for these.
// awaitingTeacher / withReview: the report is on its way but the teacher does
// not have it yet (an unopened invite, or with the review team).
export type ObservationStage =
  | 'form' | 'debrief' | 'report' | 'awaitingTeacher' | 'withReview' | 'inProgress' | 'completed';

export interface CoachVisit {
  id: string;
  teacherName: string | null;
  teacherUserId: string | null;
  schoolName: string | null;
  scheduledFor: string | null;
  scheduledSlot: string | null;
  overdue: boolean;
}

export interface CoachObservation {
  id: string;
  createdAt: string | null;
  stage: ObservationStage;
  teacherUserId: string | null;
  teacherName: string | null;
  schoolName: string | null;
  reportStatus: string | null;
  reportSentAt: string | null;
  /** Section B — did the lesson follow its plan? null when it was never looked at. */
  sectionB?: CoachSectionB | null;
}

export type SectionBVerdict =
  | 'executed'
  | 'substituted_equivalent'
  | 'substituted_better'
  | 'partial'
  | 'not_done'
  | 'not_adjudicable';

export interface SectionBMove {
  /** The move's number in the plan, as in the chat form. */
  n: number;
  phase: string | null;
  phaseLabel: string;
  text: string;
  verdict: SectionBVerdict;
  verdictLabel: string;
  /** The coach changed this verdict in chat. */
  coachChanged: boolean;
}

/** The moves and their verdicts — never a percentage, band or count. */
export type CoachSectionB =
  | { status: 'assessed'; mismatch: boolean; editedByCoach: boolean; moves: SectionBMove[] }
  | { status: 'not_assessed'; reason: string; detail: string | null; message: string };

export interface CoachObservationsData {
  upcoming: CoachVisit[];
  waiting: { form: CoachObservation[]; debrief: CoachObservation[]; report: CoachObservation[] };
  /** Reports on their way: nothing for the coach to do, not completed either. */
  delivering?: CoachObservation[];
  inProgress: CoachObservation[];
  completed: CoachObservation[];
}

export interface CoachTeacher {
  id: string;
  name: string;
  schoolName: string | null;
  observationCount: number;
  lastObservedAt: string | null;
}
