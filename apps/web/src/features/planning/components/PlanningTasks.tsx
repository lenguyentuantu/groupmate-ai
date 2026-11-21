'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { PlanSource, PlanTask } from '@/lib/api/endpoints/planning';
import PlanningWbsSummary from './PlanningWbsSummary';
import PlanningWbsTree from './PlanningWbsTree';
export default function PlanningTasks({
  tasks,
  sources,
  onChange,
}: {
  tasks: PlanTask[];
  sources: PlanSource[];
  onChange: (tasks: PlanTask[]) => void;
}) {
  const t = useTranslations('documents.planning');
  return (
    <section className="space-y-4 rounded-xl border bg-card p-3 shadow-xs sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">{t('tasks')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('taskHelp')}</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{tasks.length}/50</span>
      </div>
      <PlanningWbsSummary tasks={tasks} />
      <PlanningWbsTree
        tasks={tasks}
        sources={sources}
        onChange={(next) => onChange(tasks.map((item) => (item.id === next.id ? next : item)))}
        onRemove={(task) =>
          onChange(
            tasks
              .filter((item) => item.id !== task.id)
              .map((item) => ({
                ...item,
                parentId: item.parentId === task.id ? null : item.parentId,
                dependencyIds: item.dependencyIds.filter((id) => id !== task.id),
              })),
          )
        }
      />
      <div className="flex justify-end border-t pt-3">
        <Button
          type="button"
          variant="outline"
          disabled={tasks.length >= 50}
          onClick={() =>
            onChange([
              ...tasks,
              {
                id: crypto.randomUUID(),
                title: '',
                description: '',
                deliverable: '',
                parentId: null,
                acceptanceCriteria: [],
                priority: 'medium',
                requiredSkills: [],
                estimateMinutes: null,
                dependencyIds: [],
                sourceRefs: [],
              },
            ])
          }
        >
          {t('addTask')}
        </Button>
      </div>
    </section>
  );
}
