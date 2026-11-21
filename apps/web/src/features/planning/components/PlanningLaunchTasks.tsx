'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ChevronDown, Clock3, UserRound } from 'lucide-react';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';
import { readinessIssueCopy } from '../utils/planningReadiness';

function formatEffort(minutes: number) {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} giờ ${remainder} phút` : `${hours} giờ`;
}

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
      {baseline.tasks.map((task) => {
        const taskRisks = preview.risks.filter((risk) =>
          risk.affectedTaskIds.includes(task.sourceTaskId),
        );
        const assignee = task.assigneeUserId
          ? (memberNames.get(task.assigneeUserId) ?? 'Thành viên không còn khả dụng')
          : t('unassigned');
        return (
          <details className="group rounded-lg border px-3 py-3" key={task.sourceTaskId}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="min-w-0">
                <span className="block font-medium" dir="auto">
                  {task.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="size-3.5" />
                    {assignee}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3.5" />
                    {task.estimateMinutes === null
                      ? t('unknownEstimate')
                      : formatEffort(task.estimateMinutes)}
                  </span>
                  {taskRisks.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-3.5" />
                      {taskRisks.length} rủi ro
                    </span>
                  )}
                </span>
              </span>
              <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-2">
              <section>
                <h4 className="text-sm font-medium">Sản phẩm bàn giao</h4>
                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                  {task.deliverable || t('none')}
                </p>
              </section>
              <section>
                <h4 className="text-sm font-medium">{t('dependencies')}</h4>
                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                  {task.dependencyTaskIds.length
                    ? task.dependencyTaskIds
                        .map((id) => taskNames.get(id) ?? 'Công việc không còn khả dụng')
                        .join(', ')
                    : t('none')}
                </p>
              </section>
              <section>
                <h4 className="text-sm font-medium">Rủi ro thực hiện</h4>
                {taskRisks.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {taskRisks.map((risk) => (
                      <li key={risk.code} dir="auto">
                        {readinessIssueCopy(risk).impact}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Không có rủi ro riêng nổi bật.
                  </p>
                )}
              </section>
              <section>
                <h4 className="text-sm font-medium">Chi tiết bổ sung</h4>
                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                  {task.description || t('none')}
                </p>
                {task.acceptanceCriteria.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                    {task.acceptanceCriteria.map((criterion, index) => (
                      <li key={`${criterion}-${index}`} dir="auto">
                        {criterion}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </details>
        );
      })}
    </div>
  );
}
