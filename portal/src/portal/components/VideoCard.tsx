import { Link } from 'react-router-dom';
import { Video, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { VideoRequest } from '../types/portal';

interface VideoCardProps {
  video: VideoRequest;
}

const statusConfig = {
  pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
  processing: { color: 'bg-blue-100 text-blue-800', icon: Loader2, label: 'Processing' },
  completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completed' },
  failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Failed' }
};

const languageNames: Record<string, string> = {
  en: 'English',
  ur: 'Urdu',
  ar: 'Arabic',
  es: 'Spanish',
  'pa-PK': 'Punjabi',
  'sd-PK': 'Sindhi',
  'ps-PK': 'Pashto',
  'bal-PK': 'Balochi',
  'ta-LK': 'Tamil'
};

const VideoCard = ({ video }: VideoCardProps) => {
  const status = statusConfig[video.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const formattedDate = new Date(video.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <Link to={`/portal/video/${video.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="bg-accent/10 p-2 rounded-lg">
              <Video className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground truncate">{video.topic}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {languageNames[video.language] || video.language}
                </span>
                <span className="text-xs text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground">{formattedDate}</span>
              </div>
              {video.generation_time_seconds && (
                <p className="text-xs text-muted-foreground mt-1">
                  Generated in {Math.round(video.generation_time_seconds / 60)} min
                </p>
              )}
            </div>
            <Badge className={status.color}>
              <StatusIcon className={`w-3 h-3 mr-1 ${video.status === 'processing' ? 'animate-spin' : ''}`} />
              {status.label}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default VideoCard;
