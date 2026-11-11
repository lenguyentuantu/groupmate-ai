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
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{t('baselineTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('baselineHelp')}</p>
        <p className="mt-2 font-medium" dir="auto">
          {baseline.title}
        </p>
      </div>
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
          <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">
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
          <ul className="mt-1 space-y-2 text-sm">
            {baseline.workPackages.map((workPackage) => (
              <li className="rounded-md bg-muted p-3" key={workPackage.sourceTaskId} dir="auto">
                <span className="font-medium">{workPackage.title}</span>
                <span className="block text-muted-foreground">{workPackage.deliverable}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('taskCount', { count: workPackage.actionableTaskIds.length })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlanningLaunchTasks preview={preview} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">{t('phases')}</h3>
          <ol className="mt-1 list-decimal space-y-2 ps-5 text-sm">
            {baseline.execution.phases.map((phase) => (
              <li key={phase.order} dir="auto">
                {phase.taskIds.map((id) => taskNames.get(id) ?? id).join(', ')}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-sm font-medium">{t('checkpoints')}</h3>
          {baseline.checkpoints.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t('none')}</p>
          ) : (
            <ul className="mt-1 list-disc space-y-2 ps-5 text-sm">
              {baseline.checkpoints.map((checkpoint) => (
                <li key={checkpoint.sourceWorkPackageId} dir="auto">
                  <span className="font-medium">{checkpoint.title}</span>: {checkpoint.deliverable}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
