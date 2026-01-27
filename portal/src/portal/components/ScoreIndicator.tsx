import { cn } from '@/lib/utils';

interface ScoreIndicatorProps {
  percentage: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const ScoreIndicator = ({ percentage, size = 'medium', showLabel = true }: ScoreIndicatorProps) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Good';
    return 'Focus Area';
  };

  const scoreColor = getScoreColor(percentage);
  const scoreLabel = getScoreLabel(percentage);

  const sizeClasses = {
    small: 'w-12 h-12 text-sm',
    medium: 'w-16 h-16 text-base',
    large: 'w-20 h-20 text-lg'
  };

  const colorClasses = {
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    error: 'bg-error/10 text-error border-error/20'
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "rounded-full border-2 flex items-center justify-center font-bold",
        sizeClasses[size],
        colorClasses[scoreColor]
      )}>
        {Math.round(percentage)}%
      </div>
      {showLabel && (
        <span className={cn(
          "text-xs font-medium",
          scoreColor === 'success' && "text-success",
          scoreColor === 'warning' && "text-warning",
          scoreColor === 'error' && "text-error"
        )}>
          {scoreLabel}
        </span>
      )}
    </div>
  );
};

export default ScoreIndicator;
