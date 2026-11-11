'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';
import PlanningLaunchCapacity from './PlanningLaunchCapacity';

export default function PlanningLaunchSummary({ preview }: { preview: LaunchPreview }) {
  const t = useTranslations('documents.planning.launch');
  const status = {
    blocked: t('status.blocked'),
    needs_review: t('status.needsReview'),
    ready: t('status.ready'),
  }[preview.status];
  const issues = [...preview.blockers, ...preview.risks];

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('readinessTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('readinessHelp')}</p>
        </div>
        <Badge variant={preview.status === 'blocked' ? 'destructive' : 'secondary'}>{status}</Badge>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t('actionableTasks')}</dt>
          <dd className="text-lg font-semibold">{preview.summary.actionableTaskCount}</dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t('assignedTasks')}</dt>
          <dd className="text-lg font-semibold">
            {preview.summary.assignedTaskCount} / {preview.summary.actionableTaskCount}
          </dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t('knownEffort')}</dt>
          <dd className="text-lg font-semibold">
            {t('minutes', { count: preview.summary.knownEffortMinutes })}
          </dd>
        </div>
        <div className="rounded-md bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t('unknownEstimates')}</dt>
          <dd className="text-lg font-semibold">{preview.summary.unknownEstimateTaskCount}</dd>
        </div>
      </dl>

      {issues.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('findings')}</h3>
          {issues.map((item) => (
            <div className="rounded-md border p-3 text-sm" key={item.code}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.severity === 'blocker' ? 'destructive' : 'outline'}>
                  {item.code}
                </Badge>
                {item.affectedTaskIds.length > 0 && (
                  <span className="text-muted-foreground">
                    {t('affectedTasks', { tasks: item.affectedTaskIds.join(', ') })}
                  </span>
                )}
              </div>
              <p className="mt-2" dir="auto">
                {item.explanation}
              </p>
              <p className="mt-1 text-muted-foreground" dir="auto">
                {item.nextAction}
              </p>
            </div>
          ))}
        </div>
      )}

      <PlanningLaunchCapacity allocations={preview.summary.knownAllocations} />
    </section>
  );
}
