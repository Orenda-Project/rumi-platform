import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Eye, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { portal } from '../services/api';
import type { ReadingAssessment, ReadingStats } from '../types/readingAssessment';
import type { Pagination } from '../types/portal';
import PortalLayout from '../components/PortalLayout';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';

const PortalReadingAssessments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assessments, setAssessments] = useState<ReadingAssessment[]>([]);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, totalPages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ language: '', gradeLevel: '', passageType: '' });

  useEffect(() => {
    fetchAssessments(1);
  }, [filters]);

  const fetchAssessments = async (page: number) => {
    setLoading(true);
    try {
      const data = await portal.getReadingAssessments(
        page, 
        20,
        filters.language || undefined,
        filters.gradeLevel ? parseInt(filters.gradeLevel) : undefined,
        filters.passageType || undefined
      );
      setAssessments(data.assessments);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to load assessments",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });
  };

  const getLanguageName = (code: string) => {
    const names: Record<string, string> = { en: 'English', ur: 'Urdu', ar: 'Arabic', es: 'Spanish' };
    return names[code] || code;
  };

  const getPassageTypeDisplay = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const handleDownloadPdf = (id: string) => {
    // UPDATED: Use relative URL since frontend and backend are on same domain
    const baseUrl = import.meta.env.PROD
      ? '' // Empty string for relative URL in production (same domain)
      : 'http://localhost:4000'; // Absolute URL for local development

    window.open(`${baseUrl}/api/portal/reading-assessment/${id}/pdf`, '_blank');
  };

  if (loading) return <PortalLayout><LoadingState /></PortalLayout>;

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Reading Assessments</h1>
          <p className="text-sm text-muted-foreground">Track student reading progress and fluency</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-card rounded-lg p-5 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Total Assessments</p>
              <p className="text-2xl font-semibold text-foreground">{stats.totalAssessments}</p>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Avg WCPM</p>
              <p className="text-2xl font-semibold text-foreground">{stats.averageWcpm}</p>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Avg Accuracy</p>
              <p className="text-2xl font-semibold text-foreground">{stats.averageAccuracy}%</p>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Students Assessed</p>
              <p className="text-2xl font-semibold text-foreground">{stats.studentsAssessed}</p>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg p-5 border border-border mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={filters.language} onChange={(e) => setFilters({...filters, language: e.target.value})} className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Languages</option>
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
            </select>
            <select value={filters.gradeLevel} onChange={(e) => setFilters({...filters, gradeLevel: e.target.value})} className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Grades</option>
              {[0, 1, 2, 3, 4, 5].map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <select value={filters.passageType} onChange={(e) => setFilters({...filters, passageType: e.target.value})} className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Types</option>
              <option value="letters">Letters</option>
              <option value="words">Words</option>
              <option value="sentences">Sentences</option>
              <option value="paragraph">Paragraph</option>
              <option value="story">Story</option>
            </select>
          </div>
        </div>

        {assessments.length === 0 ? (
          <EmptyState 
            icon={FileText}
            title="No Assessments Found"
            description="No reading assessments match your current filters. Try adjusting the filters or check back later."
          />
        ) : (
          <>
            <div className="space-y-3">
              {assessments.map((assessment) => (
                <div key={assessment.id} className="bg-card border border-border rounded-lg p-6 hover:shadow-sm transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-foreground mb-2">{assessment.studentName}</h3>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md font-medium">Grade {assessment.gradeLevel}</span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-medium">{getLanguageName(assessment.language)}</span>
                        <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md font-medium">{getPassageTypeDisplay(assessment.passageType)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(assessment.assessmentDate)}</p>
                    </div>

                    <div className="flex gap-8 lg:gap-10">
                      <div className="text-center">
                        <p className="text-xl font-semibold text-foreground mb-0.5">{assessment.fluency.wcpm}</p>
                        <p className="text-xs text-muted-foreground font-medium">WCPM</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-semibold text-foreground mb-0.5">{assessment.fluency.accuracy}%</p>
                        <p className="text-xs text-muted-foreground font-medium">Accuracy</p>
                      </div>
                      {assessment.fluency.hasComprehension && (
                        <div className="text-center">
                          <p className="text-xl font-semibold text-foreground mb-0.5">{assessment.fluency.comprehensionScore}%</p>
                          <p className="text-xs text-muted-foreground font-medium">Comprehension</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
                      {assessment.hasPdfReport && (
                        <button 
                          onClick={() => handleDownloadPdf(assessment.id)} 
                          className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-secondary transition-colors"
                        >
                          <FileText size={16} />
                          <span>PDF</span>
                        </button>
                      )}
                      <button onClick={() => navigate(`/portal/reading-assessment/${assessment.id}`)} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium">
                        <Eye size={16} />
                        <span>Details</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button 
                  onClick={() => fetchAssessments(pagination.page - 1)} 
                  disabled={pagination.page === 1} 
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="text-sm text-muted-foreground font-medium">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button 
                  onClick={() => fetchAssessments(pagination.page + 1)} 
                  disabled={pagination.page === pagination.totalPages} 
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalReadingAssessments;
