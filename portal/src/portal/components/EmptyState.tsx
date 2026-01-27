import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  actionHref,
  onAction,
  className 
}: EmptyStateProps) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-6 text-center",
      className
    )}>
      <div className="bg-muted/50 p-6 rounded-full mb-4">
        <Icon className="w-12 h-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        {description}
      </p>
      {(actionLabel && (actionHref || onAction)) && (
        <Button
          variant="default"
          onClick={onAction}
          asChild={!!actionHref}
        >
          {actionHref ? (
            <a href={actionHref} target="_blank" rel="noopener noreferrer">
              {actionLabel}
            </a>
          ) : (
            actionLabel
          )}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
