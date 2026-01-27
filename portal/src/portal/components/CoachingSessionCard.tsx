import { Clock, TrendingUp, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CoachingSession } from '../types/portal';
import ScoreIndicator from './ScoreIndicator';

interface CoachingSessionCardProps {
  session: CoachingSession;
}

const CoachingSessionCard = ({ session }: CoachingSessionCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minutes`;
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-border hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground mb-1">
            Coaching Session
          </h3>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{formatDate(session.date)}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(session.duration)}
            </span>
          </div>
        </div>
        <ScoreIndicator percentage={session.percentage} size="large" />
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Overall Score</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {session.overallScore} / {session.maxScore} points ({session.percentage.toFixed(1)}%)
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          asChild
          variant="default"
          size="sm"
          className="flex-1"
        >
          <Link to={`/portal/coaching/session/${session.id}`} className="flex items-center justify-center gap-2">
            <ExternalLink className="w-4 h-4" />
            <span>View Detail</span>
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {/* TODO: Handle audio download */}}
        >
          <Download className="w-4 h-4 mr-2" />
          <span>Audio</span>
        </Button>
      </div>
    </div>
  );
};

export default CoachingSessionCard;
