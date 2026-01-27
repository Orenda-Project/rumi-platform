import { useState, useEffect } from 'react';
import { FileText, Presentation, BookOpen } from 'lucide-react';
import PortalLayout from '../components/PortalLayout';
import LessonPlanCard from '../components/LessonPlanCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { portal } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import type { LessonPlan } from '../types/portal';

const PortalLessonPlans = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [filter, setFilter] = useState<'all' | 'lesson_plan' | 'presentation'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Fetch lesson plans
  useEffect(() => {
    const fetchLessonPlans = async () => {
      setLoading(true);
      try {
        const filterType = filter === 'all' ? undefined : filter;
        const data = await portal.getLessonPlans(currentPage, itemsPerPage, filterType);
        setLessonPlans(data.lessonPlans);
      } catch (error: any) {
        console.error('Lesson plans fetch error:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load lesson plans. Please try again.",
          variant: "destructive"
        });
        setLessonPlans([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLessonPlans();
  }, [filter, currentPage, toast]);

  // Filter lesson plans
  const filteredPlans = filter === 'all' 
    ? lessonPlans 
    : lessonPlans.filter(plan => plan.content_type === filter);

  // Pagination
  const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPlans = filteredPlans.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState type="full" />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-light mb-2">Lesson Plans Library</h1>
          <p className="text-muted-foreground">
            Access all your generated lesson plans and presentations
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className="flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            All ({lessonPlans.length})
          </Button>
          <Button
            variant={filter === 'lesson_plan' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('lesson_plan')}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Lesson Plans ({lessonPlans.filter(p => p.content_type === 'lesson_plan').length})
          </Button>
          <Button
            variant={filter === 'presentation' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('presentation')}
            className="flex items-center gap-2"
          >
            <Presentation className="w-4 h-4" />
            Presentations ({lessonPlans.filter(p => p.content_type === 'presentation').length})
          </Button>
        </div>

        {/* Lesson Plans Grid */}
        {paginatedPlans.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
              {paginatedPlans.map((plan) => (
                <LessonPlanCard key={plan.id} lessonPlan={plan} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "w-10",
                        currentPage === page && "pointer-events-none"
                      )}
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No lesson plans found"
            description={filter === 'all' 
              ? "Generate your first lesson plan using the WhatsApp bot"
              : `No ${filter === 'lesson_plan' ? 'lesson plans' : 'presentations'} found`
            }
            actionLabel="Open WhatsApp"
            actionHref="https://wa.me/message/WCYNS4DTDB2MD1"
          />
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalLessonPlans;
