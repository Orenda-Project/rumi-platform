export interface User {
  firstName: string;
  lastName: string;
  phoneNumber: string;
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
