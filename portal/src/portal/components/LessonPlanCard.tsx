import { Download, FileText, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LessonPlan } from '../types/portal';

interface LessonPlanCardProps {
  lessonPlan: LessonPlan;
}

const LessonPlanCard = ({ lessonPlan }: LessonPlanCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const isPresentationType = lessonPlan.content_type === 'presentation';

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-border hover:shadow-md transition-all">
      <div className="flex items-start gap-3 mb-4">
        <div className={`p-2 rounded-lg ${isPresentationType ? 'bg-blue-50' : 'bg-accent/10'}`}>
          {isPresentationType ? (
            <Presentation className="w-5 h-5 text-blue-600" />
          ) : (
            <FileText className="w-5 h-5 text-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground mb-1 line-clamp-2">
            {lessonPlan.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {formatDate(lessonPlan.created_at)}
          </p>
        </div>
      </div>

      {(lessonPlan.subject || lessonPlan.grade_level) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {lessonPlan.subject && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
              {lessonPlan.subject}
            </span>
          )}
          {lessonPlan.grade_level && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
              {lessonPlan.grade_level}
            </span>
          )}
        </div>
      )}

      {lessonPlan.pdf_url && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full"
        >
          <a 
            href={lessonPlan.pdf_url} 
            download
            className="flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </a>
        </Button>
      )}
    </div>
  );
};

export default LessonPlanCard;
