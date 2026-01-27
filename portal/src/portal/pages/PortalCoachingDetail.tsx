import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, TrendingUp, CheckCircle2, Target, Lightbulb, FileText } from 'lucide-react';
import PortalLayout from '../components/PortalLayout';
import AudioPlayer from '../components/AudioPlayer';
import ScoreIndicator from '../components/ScoreIndicator';
import LoadingState from '../components/LoadingState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { portal } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import type { SessionDetail } from '../types/portal';

const PortalCoachingDetail = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionDetail | null>(null);

  // Fetch session detail
  useEffect(() => {
    const fetchSession = async () => {
      if (!sessionId) {
        navigate('/portal/coaching');
        return;
      }

      try {
        const data = await portal.getCoachingSession(sessionId);
        setSession(data.session);
      } catch (error: any) {
        console.error('Session detail fetch error:', error);
        toast({
          title: "Error Loading Data",
          description: "Could not load session details. Please try again.",
          variant: "destructive"
        });
        navigate('/portal/coaching');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId, navigate, toast]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minutes`;
  };

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState type="full" />
      </PortalLayout>
    );
  }

  if (!session) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-6xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/portal/coaching')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sessions
          </Button>
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">Session not found. Please try again later.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/portal/coaching')}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Sessions
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-light mb-2">Coaching Session Report</h1>
              <p className="text-muted-foreground">
                {formatDate(session.date)} • {formatDuration(session.duration)}
              </p>
            </div>
            <ScoreIndicator percentage={session.percentage} size="large" />
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default" size="sm">
              <a 
                href={session.reportPdfUrl} 
                download
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF Report
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/portal/coaching/analytics" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                View All Analytics
              </Link>
            </Button>
          </div>
        </div>

        {/* Audio Player */}
        <div className="mb-8">
          <AudioPlayer 
            audioUrl={session.audioUrl} 
            title="Session Recording"
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="analysis" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analysis">Analysis & Scores</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
          </TabsList>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            {/* Overall Score */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-semibold">Overall Performance</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-secondary rounded-lg">
                  <div className="text-3xl font-bold text-foreground">
                    {session.analysisData.overall_score.points}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Points Earned</div>
                </div>
                <div className="text-center p-4 bg-secondary rounded-lg">
                  <div className="text-3xl font-bold text-foreground">
                    {session.analysisData.overall_score.max_points}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Maximum Points</div>
                </div>
                <div className="text-center p-4 bg-secondary rounded-lg">
                  <div className="text-3xl font-bold text-accent">
                    {session.analysisData.overall_score.percentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Success Rate</div>
                </div>
              </div>
            </div>

            {/* Goal Scores */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-semibold">Goal Area Breakdown</h2>
              </div>
              <div className="space-y-4">
                {session.analysisData.goal_scores.map((goal, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{goal.goal}</span>
                      <span className="text-sm text-muted-foreground">
                        {goal.points}/{goal.max_points} ({goal.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2.5">
                      <div 
                        className="bg-accent h-2.5 rounded-full transition-all"
                        style={{ width: `${goal.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Criterion Scores */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-semibold">Detailed Criteria</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {session.analysisData.criterion_scores.map((criterion, index) => (
                  <div key={index} className="p-4 bg-secondary rounded-lg">
                    <div className="font-medium text-foreground mb-2">{criterion.criterion}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {criterion.points}/{criterion.max_points} points
                      </span>
                      <span className="text-sm font-semibold text-accent">
                        {criterion.percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h2 className="text-xl font-semibold">Strengths</h2>
              </div>
              <ul className="space-y-3">
                {session.analysisData.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth Opportunities */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-orange-600" />
                <h2 className="text-xl font-semibold">Growth Opportunities</h2>
              </div>
              <ul className="space-y-3">
                {session.analysisData.growth_opportunities.map((opportunity, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Target className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{opportunity}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-yellow-600" />
                <h2 className="text-xl font-semibold">Recommendations</h2>
              </div>
              <ul className="space-y-3">
                {session.analysisData.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <span className="text-foreground">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* Transcript Tab */}
          <TabsContent value="transcript">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-border">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-accent" />
                <h2 className="text-xl font-semibold">Session Transcript</h2>
              </div>
              <div className="prose max-w-none">
                <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                  {session.transcript}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
};

export default PortalCoachingDetail;
