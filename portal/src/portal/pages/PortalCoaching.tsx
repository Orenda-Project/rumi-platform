import { useState, useEffect } from 'react';
import { MessageSquare, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
import CoachingSessionCard from '../components/CoachingSessionCard';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { portal } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import type { CoachingSession } from '../types/portal';

const PortalCoaching = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Fetch coaching sessions
  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      try {
        const data = await portal.getCoachingSessions(currentPage, itemsPerPage);
        setSessions(data.sessions);
      } catch (error: any) {
        console.error('Coaching sessions fetch error:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load coaching sessions. Please try again.",
          variant: "destructive"
        });
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [currentPage, toast]);

  // Pagination
  const totalPages = Math.ceil(sessions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSessions = sessions.slice(startIndex, startIndex + itemsPerPage);

  // Calculate stats
  const totalSessions = sessions.length;
  const averageScore = sessions.length > 0
    ? (sessions.reduce((sum, s) => sum + s.percentage, 0) / sessions.length).toFixed(1)
    : 0;
  const latestScore = sessions.length > 0 ? sessions[0].percentage.toFixed(0) : 0;

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-light mb-2">Coaching Sessions</h1>
            <p className="text-muted-foreground">
              Review your coaching sessions and track your progress
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/coaching/analytics" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Analytics
            </Link>
          </Button>
        </div>

        {/* Quick Stats */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-border">
              <div className="text-sm text-muted-foreground mb-1">Total Sessions</div>
              <div className="text-2xl font-semibold">{totalSessions}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-border">
              <div className="text-sm text-muted-foreground mb-1">Average Score</div>
              <div className="text-2xl font-semibold">{averageScore}%</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-border">
              <div className="text-sm text-muted-foreground mb-1">Latest Score</div>
              <div className="text-2xl font-semibold">{latestScore}%</div>
            </div>
          </div>
        )}

        {/* Coaching Sessions Grid */}
        {paginatedSessions.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
              {paginatedSessions.map((session) => (
                <CoachingSessionCard key={session.id} session={session} />
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
            icon={MessageSquare}
            title="No coaching sessions yet"
            description="Complete your first coaching session using the WhatsApp bot"
            actionLabel="Open WhatsApp"
            actionHref="https://wa.me/message/WCYNS4DTDB2MD1"
          />
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalCoaching;
