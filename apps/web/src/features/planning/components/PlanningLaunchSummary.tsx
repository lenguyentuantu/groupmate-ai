'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ListChecks, UserRoundCheck } from 'lucide-react';
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
  const unassigned = preview.summary.actionableTaskCount - preview.summary.assignedTaskCount;
  const metrics = [
    {
      icon: ListChecks,
      label: t('actionableTasks'),
      value: preview.summary.actionableTaskCount,
    },
    {
      icon: UserRoundCheck,
      label: t('unassigned'),
      value: unassigned,
    },
    { icon: AlertTriangle, label: t('riskTitle'), value: preview.risks.length },
  ];

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('readinessTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('readinessHelp')}</p>
        </div>
        <Badge variant={preview.status === 'blocked' ? 'destructive' : 'secondary'}>
          {preview.status === 'ready' && <CheckCircle2 />}
          {status}
        </Badge>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div className="rounded-lg bg-muted/45 p-3" key={metric.label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <metric.icon className="size-3.5" />
              {metric.label}
            </dt>
            <dd className="mt-1 font-heading text-xl font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>

      {(preview.blockers.length > 0 || preview.risks.length > 0) && (
        <p className="text-sm font-medium">
          {preview.blockers.length} điểm chặn · {preview.risks.length} rủi ro cần xem xét
        </p>
      )}

      {preview.summary.unknownEstimateTaskCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('unknownTaskCount', { count: preview.summary.unknownEstimateTaskCount })}.{' '}
          {t('unknownEstimates')}
        </p>
      )}

      <PlanningLaunchCapacity allocations={preview.summary.knownAllocations} />
    </section>
  );
}
