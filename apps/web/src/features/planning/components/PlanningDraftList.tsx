import { ArrowRight, Clock3, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlanDraft } from '@/lib/api/endpoints/planning';
import { formatDateTime } from '@/utils/dates';
import { Button } from '@/components/ui/button';

type PlanningDraftSummary = Pick<PlanDraft, 'id' | 'title' | 'version' | 'updatedAt'>;

export default function PlanningDraftList({
  drafts,
  onOpen,
}: {
  drafts: PlanningDraftSummary[];
  onOpen: (id: number) => void;
}) {
  const t = useTranslations('documents.planning');

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {drafts.map((draft) => (
        <li key={draft.id} className="group rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium" dir="auto">
                  {draft.title}
                </h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {t('draftLabel')}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t('version', { version: draft.version })}</span>
                <span className="flex items-center gap-1">
                  <Clock3 className="size-3" />
                  {t('updatedAt', { date: formatDateTime(draft.updatedAt) })}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end border-t pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpen(draft.id)}>
              {t('openDraft')}
              <ArrowRight />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
