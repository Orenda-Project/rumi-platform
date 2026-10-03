import { Badge } from '@/components/ui/badge';
import { formatDay, STAGE_LABEL } from '../lib/observations';
import SectionBBlock from './SectionBBlock';
import type { CoachObservation } from '../types/portal';

interface ObservationRowProps {
  observation: CoachObservation;
  /** Hide the teacher name (already the page's subject). */
  hideTeacher?: boolean;
}

/** One observation as a list row, with its Section B block when it has one. Never shows a score. */
const ObservationRow = ({ observation: o, hideTeacher }: ObservationRowProps) => {
  const bits = [`Observed ${formatDay(o.createdAt)}`];
  if (o.schoolName) bits.push(o.schoolName);
  if (o.stage === 'completed' && o.reportSentAt) bits.push(`report sent ${formatDay(o.reportSentAt)}`);

  return (
    <li className="px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {hideTeacher ? `Observation ${formatDay(o.createdAt)}` : (o.teacherName || 'Teacher not named yet')}
          </div>
          <div className="text-sm text-muted-foreground truncate">{bits.join(' · ')}</div>
        </div>
        <Badge variant={o.stage === 'completed' ? 'secondary' : 'outline'} className="shrink-0">
          {STAGE_LABEL[o.stage]}
        </Badge>
      </div>
      {o.sectionB && <SectionBBlock sectionB={o.sectionB} />}
    </li>
  );
};

export default ObservationRow;
