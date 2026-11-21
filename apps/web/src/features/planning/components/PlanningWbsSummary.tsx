import { AlertTriangle, Clock3, Layers3, ListTree } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlanTask } from '@/lib/api/endpoints/planning';
import { summarizeWbs } from '../utils/planningWbs';

export default function PlanningWbsSummary({ tasks }: { tasks: PlanTask[] }) {
  const t = useTranslations('documents.planning');
  const summary = summarizeWbs(tasks);
  const hours = Math.floor(summary.knownEffortMinutes / 60);
  const minutes = summary.knownEffortMinutes % 60;
  let effort = t('effortMinutes', { minutes });
  if (hours > 0 && minutes > 0) effort = t('effortHoursMinutes', { hours, minutes });
  else if (hours > 0) effort = t('effortHours', { hours });
  const observations = [
    summary.unknownEstimateCount > 0
      ? t('summaryMissingEstimates', { count: summary.unknownEstimateCount })
      : null,
    summary.unresolvedDependencyCount > 0
      ? t('summaryUnresolvedDependencies', { count: summary.unresolvedDependencyCount })
      : null,
    summary.missingDeliverableCount > 0
      ? t('summaryMissingDeliverables', { count: summary.missingDeliverableCount })
      : null,
  ].filter((item): item is string => item !== null);

  const metrics = [
    {
      icon: Layers3,
      label: summary.childCount > 0 ? t('summaryRootGroups') : t('tasks'),
      value: summary.rootCount,
    },
    ...(summary.childCount > 0
      ? [{ icon: ListTree, label: t('summaryChildTasks'), value: summary.childCount }]
      : []),
    { icon: Clock3, label: t('summaryKnownEffort'), value: effort },
    {
      icon: AlertTriangle,
      label: t('summaryUnknownEffort'),
      value: summary.unknownEstimateCount,
    },
  ];

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg bg-muted/45 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <metric.icon className="size-3.5" />
              {metric.label}
            </dt>
            <dd className="mt-1 font-heading text-lg font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">{t('summaryEffortHelp')}</p>
      {observations.length > 0 && (
        <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5">
          <p className="text-sm font-medium">{t('reviewNotice')}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-xs text-muted-foreground">
            {observations.map((observation) => (
              <li key={observation}>{observation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
