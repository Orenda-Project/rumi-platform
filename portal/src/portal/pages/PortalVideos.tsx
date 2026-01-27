import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Video, Clock, CheckCircle, AlertCircle, Loader2, Search, Filter } from 'lucide-react';
import { portal } from '../services/api';
import PortalLayout from '../components/PortalLayout';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { VideoRequest, Pagination } from '../types/portal';

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

const PortalVideos = () => {
  const [videos, setVideos] = useState<VideoRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await portal.getVideos(page, 20);
        setVideos(response.videos);
        setPagination(response.pagination);
        setError(null);
      } catch (err) {
        setError('Failed to load videos');
        console.error('Error fetching videos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [page]);

  // Filter videos client-side (for search and filters)
  const filteredVideos = videos.filter(video => {
    // Search filter
    if (searchQuery && !video.topic.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Language filter
    if (languageFilter !== 'all' && video.language !== languageFilter) {
      return false;
    }
    // Time filter
    if (timeFilter !== 'all') {
      const videoDate = new Date(video.created_at);
      const now = new Date();
      if (timeFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (videoDate < weekAgo) return false;
      } else if (timeFilter === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (videoDate < monthAgo) return false;
      }
    }
    return true;
  });

  // Issue #20: Get thumbnail from presigned URL (now provided by backend)
  const getThumbnail = (video: VideoRequest): string | null => {
    // Prefer thumbnailUrl from backend (already presigned)
    if (video.thumbnailUrl) return video.thumbnailUrl;
    // Fallback to first slide_url if available
    if (video.slide_urls && video.slide_urls.length > 0) {
      const firstSlide = video.slide_urls[0];
      if (typeof firstSlide === 'string') return firstSlide;
    }
    return null;
  };

  if (loading) {
    return (
      <PortalLayout>
        <LoadingState message="Loading videos..." />
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout>
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Try Again
          </Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Videos</h1>
            <p className="text-muted-foreground">
              Educational videos generated with Rumi
            </p>
          </div>
          {pagination && (
            <p className="text-sm text-muted-foreground">
              {pagination.total} video{pagination.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Languages</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ur">Urdu</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Video Grid */}
        {filteredVideos.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No videos found"
            description={videos.length === 0
              ? "Your generated videos will appear here. Start by requesting a video through Rumi on WhatsApp!"
              : "No videos match your search criteria. Try adjusting your filters."
            }
          />
        ) : (
          <>
            {/* Thumbnail Grid Layout (per spec 7.1) - Issue #23: Improved spacing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredVideos.map((video) => {
                const status = statusConfig[video.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                const thumbnail = getThumbnail(video);
                const formattedDate = new Date(video.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });

                return (
                  <Link
                    key={video.id}
                    to={`/portal/video/${video.id}`}
                    className="group"
                  >
                    <div className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      {/* Thumbnail */}
                      <div className="aspect-video bg-gray-100 relative overflow-hidden">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={video.topic}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
                            <Video className="w-12 h-12 text-accent/50" />
                          </div>
                        )}
                        {/* Status Badge */}
                        <div className="absolute top-2 right-2">
                          <Badge className={status.color}>
                            <StatusIcon className={`w-3 h-3 mr-1 ${video.status === 'processing' ? 'animate-spin' : ''}`} />
                            {status.label}
                          </Badge>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <h3 className="font-medium text-foreground truncate">{video.topic}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{languageNames[video.language] || video.language}</span>
                          <span>|</span>
                          <span>{formattedDate}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalVideos;
