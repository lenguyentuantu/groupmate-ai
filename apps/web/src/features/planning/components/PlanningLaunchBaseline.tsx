'use client';

import { useTranslations } from 'next-intl';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';
import PlanningLaunchTasks from './PlanningLaunchTasks';

export default function PlanningLaunchBaseline({ preview }: { preview: LaunchPreview }) {
  const t = useTranslations('documents.planning.launch');
  const baseline = preview.baseline;
  if (!baseline) return null;
  const taskNames = new Map(baseline.tasks.map((task) => [task.sourceTaskId, task.title]));

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div>
        <h2 className="font-heading font-semibold">{t('baselineTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('baselineHelp')}</p>
      </div>
      <PlanningLaunchTasks preview={preview} />
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Chi tiết đầy đủ của kế hoạch
        </summary>
        <div className="mt-4 space-y-5">
          <p className="font-medium" dir="auto">
            {baseline.title}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t('wbsVersion')}</dt>
              <dd>{baseline.source.wbsVersion}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('proposalVersion')}</dt>
              <dd>{baseline.source.proposalVersion}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('deadline')}</dt>
              <dd>{baseline.deadline ?? t('notSet')}</dd>
            </div>
          </dl>
          {baseline.assumptions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">{t('assumptions')}</h3>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {baseline.assumptions.map((assumption) => (
                  <li dir="auto" key={assumption}>
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {baseline.workPackages.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">{t('workPackages')}</h3>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {baseline.workPackages.map((workPackage) => (
                  <li className="rounded-lg bg-muted/45 p-3 text-sm" key={workPackage.sourceTaskId}>
                    <span className="font-medium" dir="auto">
                      {workPackage.title}
                    </span>
                    <span className="mt-1 block text-muted-foreground" dir="auto">
                      {workPackage.deliverable}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t('taskCount', { count: workPackage.actionableTaskIds.length })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">{t('phases')}</h3>
              <ol className="mt-1 list-decimal space-y-2 ps-5 text-sm text-muted-foreground">
                {baseline.execution.phases.map((phase) => (
                  <li key={phase.order} dir="auto">
                    {phase.taskIds
                      .map((id) => taskNames.get(id) ?? 'Công việc không còn khả dụng')
                      .join(', ')}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-medium">{t('checkpoints')}</h3>
              {baseline.checkpoints.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('none')}</p>
              ) : (
                <ul className="mt-1 list-disc space-y-2 ps-5 text-sm text-muted-foreground">
                  {baseline.checkpoints.map((checkpoint) => (
                    <li key={checkpoint.sourceWorkPackageId} dir="auto">
                      <span className="font-medium text-foreground">{checkpoint.title}</span>:{' '}
                      {checkpoint.deliverable}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
