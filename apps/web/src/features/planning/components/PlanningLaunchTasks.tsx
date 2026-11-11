'use client';

import { useTranslations } from 'next-intl';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';

export default function PlanningLaunchTasks({ preview }: { preview: LaunchPreview }) {
  const t = useTranslations('documents.planning.launch');
  const baseline = preview.baseline;
  if (!baseline) return null;
  const memberNames = new Map(
    preview.summary.knownAllocations.map((allocation) => [
      allocation.memberId,
      allocation.memberName,
    ]),
  );
  const taskNames = new Map(baseline.tasks.map((task) => [task.sourceTaskId, task.title]));

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t('workItemsTitle')}</h3>
      {baseline.tasks.map((task) => (
        <div className="rounded-md border p-3 text-sm" key={task.sourceTaskId}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium" dir="auto">
              {task.title}
            </p>
            <span className="text-muted-foreground">
              {task.estimateMinutes === null
                ? t('unknownEstimate')
                : t('minutes', { count: task.estimateMinutes })}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground" dir="auto">
            {task.deliverable}
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('assignee')}</dt>
              <dd dir="auto">
                {task.assigneeUserId
                  ? (memberNames.get(task.assigneeUserId) ?? task.assigneeUserId)
                  : t('unassigned')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('dependencies')}</dt>
              <dd dir="auto">
                {task.dependencyTaskIds.length
                  ? task.dependencyTaskIds.map((id) => taskNames.get(id) ?? id).join(', ')
                  : t('none')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('relativeWeek')}</dt>
              <dd>{task.relativeWeek ?? t('unknown')}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
