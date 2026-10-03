import { useState } from 'react';
import { AlertTriangle, ChevronDown, Pencil } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { CoachSectionB, SectionBVerdict } from '../types/portal';

/** Chip colour per verdict: kept, swapped, half-done, missed, unknown. */
const VERDICT_TONE: Record<SectionBVerdict, string> = {
  executed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  substituted_equivalent: 'bg-sky-50 text-sky-800 border-sky-200',
  substituted_better: 'bg-sky-50 text-sky-800 border-sky-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  not_done: 'bg-rose-50 text-rose-800 border-rose-200',
  not_adjudicable: 'bg-muted text-muted-foreground border-border',
};

/**
 * Section B under an observation — did the lesson follow its plan? Folded
 * until opened. Assessed: the plan's moves in order with the verdict the coach
 * kept or set in chat. Not assessed: why, in words. Never a percentage, a
 * band or a zero; the server never sends them.
 */
const SectionBBlock = ({ sectionB }: { sectionB: CoachSectionB }) => {
  const [open, setOpen] = useState(false);
  const assessed = sectionB.status === 'assessed';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
        Lesson plan (Section B)
        {!assessed && <span className="text-xs">· not assessed</span>}
        {assessed && sectionB.mismatch && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-label="plan mismatch" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {sectionB.status === 'not_assessed' ? (
          <p className="text-sm text-muted-foreground">Not assessed — {sectionB.message}</p>
        ) : (
          <div className="space-y-2">
            {sectionB.mismatch && (
              <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                The recording does not look like this plan's lesson. Check that the right plan was linked.
              </p>
            )}
            <ol className="space-y-1.5">
              {sectionB.moves.map((m) => (
                <li key={m.n} className="flex items-start gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-muted-foreground">{m.n}</span>
                  <span className="min-w-0 flex-1">
                    {m.phaseLabel && <span className="text-muted-foreground">{m.phaseLabel} — </span>}
                    {m.text}
                  </span>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', VERDICT_TONE[m.verdict] ?? VERDICT_TONE.not_adjudicable)}>
                    {m.verdictLabel}
                  </span>
                  {m.coachChanged && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground" title="You changed this verdict in chat">
                      <Pencil className="w-3 h-3" />
                      changed by you
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default SectionBBlock;
