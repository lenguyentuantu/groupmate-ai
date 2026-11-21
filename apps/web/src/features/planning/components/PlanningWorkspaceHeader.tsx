import { CalendarDays, CheckCircle2, Clock3, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Plan } from '@/lib/api/endpoints/planning';
import { summarizeWbs } from '../utils/planningWbs';

export default function PlanningWorkspaceHeader({
  plan,
  version,
  status,
  contentStatus,
  saveFormId,
  dirty = false,
  saving = false,
  saveDisabled = false,
  saveError,
}: {
  plan: Plan;
  version: number;
  status: string;
  contentStatus: string;
  saveFormId?: string;
  dirty?: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  saveError?: string;
}) {
  const t = useTranslations('documents.planning');
  const summary = summarizeWbs(plan.tasks);
  const hours = Math.floor(summary.knownEffortMinutes / 60);
  const minutes = summary.knownEffortMinutes % 60;
  let effort = t('effortMinutes', { minutes });
  if (hours > 0 && minutes > 0) effort = t('effortHoursMinutes', { hours, minutes });
  else if (hours > 0) effort = t('effortHours', { hours });
  let saveStatus = t('saved');
  if (saving) saveStatus = t('saving');
  else if (saveError) saveStatus = saveError;
  else if (dirty) saveStatus = t('unsaved');
  const metrics = [
    { icon: ListChecks, label: t('tasks'), value: plan.tasks.length },
    {
      icon: Clock3,
      label: t('summaryKnownEffort'),
      value: effort,
    },
    {
      icon: CalendarDays,
      label: t('deadline'),
      value: plan.deadline ?? t('unknown'),
    },
  ];

  return (
    <header className="rounded-2xl border bg-card px-4 py-4 shadow-xs sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t('version', { version })}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <CheckCircle2 className="size-3.5 text-primary" />
              {status}
            </span>
          </div>
          <h1
            className="mt-1 truncate font-heading text-xl font-semibold tracking-tight"
            dir="auto"
          >
            {plan.title || t('draftStatus')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contentStatus}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {saveFormId && (
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              <span
                className={saveError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
                role={saveError ? 'alert' : 'status'}
              >
                {saveStatus}
              </span>
              <Button type="submit" form={saveFormId} size="sm" disabled={saveDisabled}>
                {saving ? t('saving') : t('save')}
              </Button>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <metric.icon className="size-3.5" />
                  {metric.label}
                </dt>
                <dd className="mt-0.5 truncate font-medium" dir="auto">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </header>
  );
}
