import { FileText, Sparkles, UserRoundCheck, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PlanningWorkflowSteps() {
  const t = useTranslations('documents.planning.workflow');
  const steps = [
    { key: 'sources', label: t('sources'), icon: FileText },
    { key: 'wbs', label: t('wbs'), icon: Sparkles },
    { key: 'assignment', label: t('assignment'), icon: UsersRound },
    { key: 'approval', label: t('approval'), icon: UserRoundCheck },
  ] as const;

  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('label')}>
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3"
        >
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <step.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t('step', { number: index + 1 })}
            </p>
            <p className="truncate text-sm font-medium">{step.label}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
