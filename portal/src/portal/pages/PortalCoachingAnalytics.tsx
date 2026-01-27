import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Target, Award, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import PortalLayout from '../components/PortalLayout';
import LoadingState from '../components/LoadingState';
import { Button } from '@/components/ui/button';
import { portal } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import type { CoachingAnalytics } from '../types/portal';

const PortalCoachingAnalytics = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<CoachingAnalytics | null>(null);

  // Fetch analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await portal.getCoachingAnalytics();
        setAnalytics(data.analytics);
      } catch (error: any) {
        console.error('Analytics fetch error:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load analytics data. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [toast]);

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState type="full" />
      </PortalLayout>
    );
  }

  if (!analytics) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/portal/coaching')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Coaching
          </Button>
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">No analytics data available. Please try again later.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Score Trend Chart Configuration
  const scoreTrendOptions: ApexOptions = {
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
      categories: analytics.overallScoreTrend.map(item => {
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
    markers: {
      size: 5,
      colors: ['hsl(15, 85%, 60%)'],
      strokeColors: '#fff',
      strokeWidth: 2,
      hover: {
        size: 7,
      },
    },
  };

  const scoreTrendSeries = [{
    name: 'Score',
    data: analytics.overallScoreTrend.map(item => item.percentage)
  }];

  // Goal Area Breakdown Chart Configuration
  const goalBreakdownOptions: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        dataLabels: {
          position: 'top',
        },
      },
    },
    colors: ['hsl(15, 85%, 60%)'],
    dataLabels: {
      enabled: true,
      formatter: (val) => `${val}%`,
      offsetX: 30,
      style: {
        fontSize: '12px',
        colors: ['hsl(220, 9%, 46%)'],
      },
    },
    xaxis: {
      categories: analytics.goalAreaBreakdown.map(item => item.name),
      max: 100,
      labels: {
        formatter: (value) => `${value}%`,
        style: {
          colors: 'hsl(220, 9%, 46%)',
          fontSize: '12px',
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: 'hsl(220, 9%, 46%)',
          fontSize: '12px',
        },
      },
    },
    grid: {
      borderColor: 'hsl(220, 13%, 91%)',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: true,
        },
      },
    },
    tooltip: {
      y: {
        formatter: (value) => `${value}%`,
      },
    },
  };

  const goalBreakdownSeries = [{
    name: 'Score',
    data: analytics.goalAreaBreakdown.map(item => item.percentage)
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
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/portal/coaching')}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sessions
          </Button>

          <h1 className="text-3xl sm:text-4xl font-light mb-2">Your Teaching Journey</h1>
          <p className="text-muted-foreground">
            Track your progress and identify areas for growth
          </p>
        </div>

        {/* Key Insights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted-foreground">Total Sessions</span>
            </div>
            <div className="text-3xl font-bold text-foreground">
              {analytics.insights.totalSessions}
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted-foreground">Average Score</span>
            </div>
            <div className="text-3xl font-bold text-foreground">
              {analytics.insights.averageScore.toFixed(1)}%
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground">Improvement</span>
            </div>
            <div className="text-3xl font-bold text-green-600">
              +{analytics.insights.improvement.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Since first session</p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted-foreground">Strongest Area</span>
            </div>
            <div className="text-lg font-semibold text-foreground leading-tight">
              {analytics.insights.bestGoalArea}
            </div>
          </div>
        </div>

        {/* Score Trend Over Time */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-border mb-8">
          <h2 className="text-2xl font-light mb-6">Score Progress Over Time</h2>
          <Chart
            options={scoreTrendOptions}
            series={scoreTrendSeries}
            type="line"
            height={350}
          />
        </div>

        {/* Goal Area Breakdown */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-border mb-8">
          <h2 className="text-2xl font-light mb-6">Performance by Goal Area</h2>
          <Chart
            options={goalBreakdownOptions}
            series={goalBreakdownSeries}
            type="bar"
            height={300}
          />
        </div>

        {/* Detailed Goal Analysis */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-border mb-8">
          <h2 className="text-2xl font-light mb-6">Detailed Goal Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {analytics.goalAreaBreakdown.map((goal, index) => (
              <div key={index} className="p-4 bg-secondary rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">{goal.name}</h3>
                  <span className="text-2xl font-bold text-accent">
                    {goal.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                  <span>Score: {goal.score}/{goal.maxScore}</span>
                </div>
                <div className="w-full bg-background rounded-full h-2">
                  <div 
                    className="bg-accent h-2 rounded-full transition-all"
                    style={{ width: `${goal.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Focus Area Recommendation */}
        <div className="bg-gradient-to-r from-accent/10 to-primary/10 rounded-lg p-6 border border-accent/20">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-lg">
              <Target className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">Recommended Focus Area</h3>
              <p className="text-foreground mb-4">
                Based on your recent sessions, we recommend focusing on <strong>{analytics.insights.focusArea}</strong>. 
                This area shows the most opportunity for improvement and can have a significant impact on your overall teaching effectiveness.
              </p>
              <Button asChild className="bg-accent hover:bg-accent/90">
                <a 
                  href="https://wa.me/message/WCYNS4DTDB2MD1" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Get Coaching on This Area
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export default PortalCoachingAnalytics;
