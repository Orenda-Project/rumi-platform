import { useState, useEffect } from 'react';
import { BookOpen, MessageSquare, TrendingUp, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { useAuth } from '../hooks/useAuth';
import { portal } from '../services/api';
import PortalLayout from '../components/PortalLayout';
import StatCard from '../components/StatCard';
import LessonPlanCard from '../components/LessonPlanCard';
import ScoreIndicator from '../components/ScoreIndicator';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { DashboardStats, LessonPlan, CoachingSession } from '../types/portal';

const PortalDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalLessonPlans: 0, totalCoachingSessions: 0 });
  const [recentLessonPlans, setRecentLessonPlans] = useState<LessonPlan[]>([]);
  const [recentSession, setRecentSession] = useState<CoachingSession | null>(null);
  const [scoreTrend, setScoreTrend] = useState<Array<{ date: string; score: number; percentage: number }>>([]);

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await portal.getDashboard();
        setStats(data.stats);
        setRecentLessonPlans(data.recentLessonPlans);
        setRecentSession(data.recentCoachingSession || null);
        
        // Fetch analytics for score trend
        try {
          const analyticsData = await portal.getCoachingAnalytics();
          setScoreTrend(analyticsData.analytics.overallScoreTrend);
        } catch (error) {
          console.log('Analytics not available');
        }
      } catch (error: any) {
        console.error('Dashboard fetch error:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load dashboard data. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [toast]);

  // Chart configuration for score trend
  const chartOptions: ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
    },
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    colors: ['hsl(15, 85%, 60%)'],
    grid: {
      borderColor: 'hsl(220, 13%, 91%)',
      strokeDashArray: 4,
    },
    xaxis: {
      categories: scoreTrend.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      labels: {
        style: {
          colors: 'hsl(220, 9%, 46%)',
          fontSize: '12px',
        },
      },
    },
    yaxis: {
      min: 0,
      max: 100,
      labels: {
        style: {
          colors: 'hsl(220, 9%, 46%)',
          fontSize: '12px',
        },
        formatter: (value) => `${value}%`,
      },
    },
    tooltip: {
      y: {
        formatter: (value) => `${value}%`,
      },
    },
    dataLabels: {
      enabled: false,
    },
  };

  const chartSeries = [{
    name: 'Score',
    data: scoreTrend.map(item => item.percentage)
  }];

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
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-light mb-2">
            Welcome back, {user?.firstName}! 👋
          </h1>
          <p className="text-muted-foreground">
            Here's an overview of your teaching journey
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <StatCard
            title="Lesson Plans"
            value={stats.totalLessonPlans}
            icon={BookOpen}
          />
          <StatCard
            title="Coaching Sessions"
            value={stats.totalCoachingSessions}
            icon={MessageSquare}
          />
          <StatCard
            title="Latest Score"
            value={recentSession ? `${recentSession.percentage.toFixed(0)}%` : 'N/A'}
            icon={TrendingUp}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Recent Lesson Plans */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Recent Lesson Plans</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/portal/lesson-plans" className="flex items-center gap-2">
                  View All
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </Button>
            </div>

            {recentLessonPlans.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {recentLessonPlans.map((plan) => (
                  <LessonPlanCard key={plan.id} lessonPlan={plan} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No lesson plans yet"
                description="Generate your first lesson plan using the WhatsApp bot"
                actionLabel="Open WhatsApp"
                actionHref="https://wa.me/message/WCYNS4DTDB2MD1"
              />
            )}
          </div>

          {/* Coaching Score Trend */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-light">Score Trend</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/portal/coaching/analytics" className="flex items-center gap-2">
                  Details
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </Button>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <Chart
                options={chartOptions}
                series={chartSeries}
                type="line"
                height={250}
              />
            </div>

            {/* Recent Coaching Session */}
            {recentSession && (
              <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
                <h3 className="text-lg font-semibold mb-4">Latest Session</h3>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {new Date(recentSession.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(recentSession.duration / 60)} minutes
                    </p>
                  </div>
                  <ScoreIndicator 
                    percentage={recentSession.percentage} 
                    size="medium"
                  />
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to={`/portal/coaching/session/${recentSession.id}`}>
                    View Full Report
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gradient-to-r from-accent/10 to-primary/10 rounded-lg p-6 border border-accent/20">
          <h3 className="text-xl font-semibold mb-2">Ready to improve your teaching?</h3>
          <p className="text-muted-foreground mb-4">
            Get personalized coaching and lesson plans through WhatsApp
          </p>
          <Button asChild className="bg-accent hover:bg-accent/90">
            <a 
              href="https://wa.me/message/WCYNS4DTDB2MD1" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </PortalLayout>
  );
};

export default PortalDashboard;
