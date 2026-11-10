'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { PlanTask } from '@/lib/api/endpoints/planning';
import PlanningTask from './PlanningTask';
export default function PlanningTasks({
  tasks,
  onChange,
}: {
  tasks: PlanTask[];
  onChange: (tasks: PlanTask[]) => void;
}) {
  const t = useTranslations('documents.planning');
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">
        {t('tasks')} ({tasks.length}/50)
      </h2>
      <p className="text-sm">{t('taskHelp')}</p>
      {tasks.map((task) => (
        <PlanningTask
          key={task.id}
          task={task}
          tasks={tasks}
          onChange={(next) => onChange(tasks.map((item) => (item.id === next.id ? next : item)))}
          onRemove={() =>
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
      ))}
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
    </section>
  );
}
