import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Video, Download, FileText, Clock, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { portal } from '../services/api';
import PortalLayout from '../components/PortalLayout';
import LoadingState from '../components/LoadingState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { VideoDetail } from '../types/portal';

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

const PortalVideoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const response = await portal.getVideo(id);
        setVideo(response.video);
        setError(null);
      } catch (err) {
        setError('Failed to load video details');
        console.error('Error fetching video:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState message="Loading video details..." />
      </PortalLayout>
    );
  }

  if (error || !video) {
    return (
      <PortalLayout>
        <div className="text-center py-12">
          <p className="text-destructive">{error || 'Video not found'}</p>
          <Link to="/portal/videos">
            <Button className="mt-4">Back to Videos</Button>
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const status = statusConfig[video.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const formattedDate = new Date(video.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header - Issue #19: Improved title padding and spacing */}
        <div className="flex items-center gap-4 bg-white rounded-lg p-4 shadow-sm">
          <Link to="/portal/videos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0 pl-2">
            <h1 className="text-xl md:text-2xl font-bold text-foreground leading-tight truncate">{video.topic}</h1>
            <p className="text-muted-foreground text-sm mt-1">{formattedDate}</p>
          </div>
          <Badge className={status.color}>
            <StatusIcon className={`w-3 h-3 mr-1 ${video.status === 'processing' ? 'animate-spin' : ''}`} />
            {status.label}
          </Badge>
        </div>

        {/* Video Player */}
        {video.video_url && video.status === 'completed' && (
          <Card>
            <CardContent className="p-0">
              <video
                controls
                className="w-full rounded-lg"
                src={video.video_url}
                poster={video.slide_urls?.[0]}
              >
                Your browser does not support the video tag.
              </video>
            </CardContent>
          </Card>
        )}

        {/* Processing Status */}
        {video.status === 'processing' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-6 text-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-blue-800">Video is being generated</h3>
              <p className="text-blue-600 mt-2">
                Step {video.current_step || 1} of 4 - This usually takes 10-12 minutes
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error Status */}
        {video.status === 'failed' && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-red-800">Video generation failed</h3>
              {video.error_message && (
                <p className="text-red-600 mt-2">{video.error_message}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Details */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="w-5 h-5" />
                Video Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Language</span>
                <span className="font-medium">{languageNames[video.language] || video.language}</span>
              </div>
              {video.generation_time_seconds && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Generation Time</span>
                  <span className="font-medium">{Math.round(video.generation_time_seconds / 60)} minutes</span>
                </div>
              )}
              {video.script_data?.slides && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slides</span>
                  <span className="font-medium">{video.script_data.slides.length}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Downloads */}
          {(video.video_url || video.pdf_url) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Downloads
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {video.video_url && (
                  <a
                    href={video.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Video className="w-4 h-4" />
                      Download Video
                    </Button>
                  </a>
                )}
                {video.pdf_url && (
                  <a
                    href={video.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="w-full justify-start gap-2 mt-2">
                      <FileText className="w-4 h-4" />
                      View PDF Slides
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Slide Images Gallery (spec 7.2 - clickable to view full size) */}
        {video.slide_urls && video.slide_urls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Slide Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {video.slide_urls.map((url, index) => (
                  typeof url === 'string' && (
                    <button
                      key={index}
                      onClick={() => setLightboxImage(url)}
                      className="aspect-video bg-gray-100 rounded-lg overflow-hidden hover:ring-2 hover:ring-accent transition-all cursor-pointer"
                    >
                      <img
                        src={url}
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lightbox for full-size slide viewing */}
        {lightboxImage && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <button
              className="absolute top-4 right-4 text-white hover:text-gray-300"
              onClick={() => setLightboxImage(null)}
            >
              <X className="w-8 h-8" />
            </button>
            <img
              src={lightboxImage}
              alt="Full size slide"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalVideoDetail;
