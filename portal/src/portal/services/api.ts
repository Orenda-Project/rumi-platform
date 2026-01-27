import axios from 'axios';
import type { User, DashboardStats, LessonPlan, CoachingSession, SessionDetail, CoachingAnalytics, Pagination, VideoRequest, VideoDetail } from '../types/portal';
import type { ReadingAssessment, ReadingAssessmentDetail, ReadingStats } from '../types/readingAssessment';

// Use relative URL since frontend and backend are on same domain
// This fixes mobile cookie blocking issues - no more CORS, no more third-party cookies!
// GitHub Actions auto-deploy workflow active - edits in Lovable deploy automatically!
const API_BASE_URL = import.meta.env.PROD
  ? '/api/portal' // Relative URL for production (same domain)
  : 'http://localhost:4000/api/portal'; // Absolute URL for local development

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // CRITICAL: Includes session cookies
  headers: { 
    'Content-Type': 'application/json' 
  }
});

// Global error interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired - redirect to login
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      // Don't redirect if already on login/setup pages
      if (!currentPath.includes('/portal/login') && 
          !currentPath.includes('/portal/setup') &&
          !currentPath.includes('/portal/reset-password')) {
        window.location.href = '/portal/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const auth = {
  validateToken: async (token: string) => {
    const response = await api.post('/validate-token', { token });
    return response.data;
  },
  
  setup: async (token: string, password: string) => {
    const response = await api.post('/setup', { token, password });
    return response.data;
  },
  
  login: async (phoneNumber: string, password: string) => {
    const response = await api.post('/login', { phoneNumber, password });
    return response.data;
  },
  
  logout: async () => {
    const response = await api.post('/logout');
    return response.data;
  },
  
  requestReset: async (phoneNumber: string) => {
    const response = await api.post('/request-reset', { phoneNumber });
    return response.data;
  },
  
  verifyResetCode: async (phoneNumber: string, code: string) => {
    const response = await api.post('/verify-reset-code', { phoneNumber, code });
    return response.data;
  },
  
  resetPassword: async (password: string) => {
    const response = await api.post('/reset-password', { password });
    return response.data;
  }
};

// Data endpoints
export const portal = {
  getDashboard: async (): Promise<{
    user: User;
    stats: DashboardStats;
    recentLessonPlans: LessonPlan[];
    recentCoachingSession?: CoachingSession;
  }> => {
    const response = await api.get('/dashboard');
    return response.data;
  },
  
  getLessonPlans: async (page = 1, limit = 20, type?: string): Promise<{
    lessonPlans: LessonPlan[];
    pagination: Pagination;
  }> => {
    const response = await api.get('/lesson-plans', { 
      params: { page, limit, type } 
    });
    return response.data;
  },
  
  getCoachingSessions: async (page = 1, limit = 20): Promise<{
    sessions: CoachingSession[];
    pagination: Pagination;
  }> => {
    const response = await api.get('/coaching-sessions', { 
      params: { page, limit } 
    });
    return response.data;
  },
  
  getCoachingSession: async (id: string): Promise<{
    session: SessionDetail;
  }> => {
    const response = await api.get(`/coaching-session/${id}`);
    return response.data;
  },
  
  getCoachingAnalytics: async (): Promise<{
    analytics: CoachingAnalytics;
  }> => {
    const response = await api.get('/coaching-analytics');
    return response.data;
  },
  
  getReadingAssessments: async (
    page = 1, 
    limit = 20,
    language?: string,
    gradeLevel?: number,
    passageType?: string
  ): Promise<{
    assessments: ReadingAssessment[];
    stats: ReadingStats;
    pagination: Pagination;
  }> => {
    const response = await api.get('/reading-assessments', {
      params: { page, limit, language, gradeLevel, passageType }
    });
    return response.data;
  },
  
  getReadingAssessment: async (id: string): Promise<{
    assessment: ReadingAssessmentDetail;
  }> => {
    const response = await api.get(`/reading-assessment/${id}`);
    return response.data;
  },

  // Issue #7: Video Library endpoints
  getVideos: async (page = 1, limit = 20): Promise<{
    videos: VideoRequest[];
    pagination: Pagination;
  }> => {
    const response = await api.get('/videos', {
      params: { page, limit }
    });
    return response.data;
  },

  getVideo: async (id: string): Promise<{
    video: VideoDetail;
  }> => {
    const response = await api.get(`/video/${id}`);
    return response.data;
  }
};

export default api;
