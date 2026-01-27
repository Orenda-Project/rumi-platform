import { cn } from '@/lib/utils';

interface LoadingStateProps {
  type?: 'card' | 'list' | 'table' | 'full';
  count?: number;
  className?: string;
}

const LoadingState = ({ type = 'card', count = 3, className }: LoadingStateProps) => {
  if (type === 'full') {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", className)}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={cn("grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded"></div>
                <div className="h-2 bg-muted rounded w-5/6"></div>
              </div>
              <div className="flex gap-2 pt-2">
                <div className="h-8 bg-muted rounded flex-1"></div>
                <div className="h-8 bg-muted rounded flex-1"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-6 shadow-sm border border-border">
            <div className="animate-pulse flex items-center gap-4">
              <div className="w-12 h-12 bg-muted rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // table type
  return (
    <div className={cn("bg-white rounded-lg shadow-sm border border-border overflow-hidden", className)}>
      <div className="animate-pulse p-6 space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 bg-muted rounded flex-1"></div>
            <div className="h-4 bg-muted rounded flex-1"></div>
            <div className="h-4 bg-muted rounded flex-1"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingState;
