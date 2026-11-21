'use client';

import { useTranslations } from 'next-intl';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';
import { readinessIssueCopy } from '../utils/planningReadiness';

export default function PlanningLaunchRisks({
  preview,
  acknowledged,
  onToggle,
}: {
  preview: LaunchPreview;
  acknowledged: Set<string>;
  onToggle: (code: string, checked: boolean) => void;
}) {
  const t = useTranslations('documents.planning.launch');
  const issues = [...preview.blockers, ...preview.risks];
  const taskNames = new Map(
    preview.baseline?.tasks.map((task) => [task.sourceTaskId, task.title]) ?? [],
  );
  if (issues.length === 0)
    return (
      <section className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <CheckCircle2 className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="font-semibold">Không có điểm chặn hoặc rủi ro cần xác nhận</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Đường cơ sở hiện đáp ứng các kiểm tra sẵn sàng của hệ thống.
          </p>
        </div>
      </section>
    );

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div>
        <h2 className="font-semibold">{t('riskTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('riskHelp')}</p>
      </div>
      {issues.map((issue) => {
        const copy = readinessIssueCopy(issue);
        const taskList = issue.affectedTaskIds.map(
          (id) => taskNames.get(id) ?? 'Công việc không còn khả dụng',
        );
        const content = (
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex items-center gap-2 font-medium">
              {issue.severity === 'blocker' ? (
                <AlertOctagon className="size-4 text-destructive" />
              ) : (
                <AlertTriangle className="size-4 text-amber-600" />
              )}
              {copy.title}
            </div>
            <p className="mt-1.5" dir="auto">
              {copy.impact}
            </p>
            <details className="mt-2 text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">Cách xử lý</summary>
              <p className="mt-1" dir="auto">
                {copy.action}
              </p>
            </details>
            {taskList.length > 0 && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                  Xem danh sách công việc
                </summary>
                <ul className="mt-2 list-disc space-y-1 ps-5">
                  {taskList.map((taskName, index) => (
                    <li key={`${taskName}-${index}`} dir="auto">
                      {taskName}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
        if (issue.severity === 'blocker')
          return (
            <div
              className="flex items-start gap-3 rounded-lg border border-destructive/30 p-3"
              key={issue.code}
            >
              {content}
            </div>
          );
        return (
          <div className="flex items-start gap-3 rounded-lg border p-3" key={issue.code}>
            <Checkbox
              className="mt-0.5"
              aria-label={`Xác nhận: ${copy.title}`}
              checked={acknowledged.has(issue.code)}
              onCheckedChange={(checked) => onToggle(issue.code, checked === true)}
            />
            {content}
          </div>
        );
      })}
    </section>
  );
}
